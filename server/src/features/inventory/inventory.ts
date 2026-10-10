/**
 * Inventory: the one way variant stock changes.
 *
 * Every change runs inside the caller's transaction and
 * - locks the variant rows (in id order, so concurrent orders can't deadlock; NO KEY UPDATE so the
 *   foreign-key locks taken by inserting order items don't conflict with it),
 * - refuses to take stock below zero, with a readable `InsufficientStockError`,
 * - writes an inventory movement, so the history accounts for every unit,
 * - raises a low-stock alert (staff-alerts, "stock") when the change crosses a variant's threshold or empties it.
 *
 * Alerts are written in the same transaction; their live pushes and the outbox wake-up go into the
 * caller's `AfterCommit`.
 */
import type { sql } from '../../lib/db';
import { BadRequestError } from '../../lib/errors';
import type { AfterCommit } from '../../lib/after-commit';
import { alertStaff } from '../staff-alerts/staff-alerts';
import { stockCrossing, type StockLevel } from './stock-policy';

type Executor = typeof sql;

export type MovementReason = 'ORDER_PLACED' | 'ORDER_CANCELLED' | 'ADMIN_ADJUSTMENT' | 'RESTOCK';

export interface StockLine {
    variantId: number;
    quantity: number;
}

export interface MovementDetails {
    /** The order (or other record) that caused the change. */
    referenceId?: number | null;
    note?: string | null;
    /** Staff user who made the change. */
    by?: number | null;
}

export interface StockShortage {
    variantId: number;
    label: string;
    available: number;
    requested: number;
}

export class InsufficientStockError extends BadRequestError {
    constructor(readonly shortages: StockShortage[]) {
        super(shortages
            .map((s) => s.available > 0 ? `Only ${s.available} left of ${s.label}` : `${s.label} is out of stock`)
            .join('; '));
    }
}

interface LockedVariant {
    id: number;
    stock: number;
    low_stock_threshold: number;
    size: string | null;
    color: string | null;
    product_name: string;
}

const variantLabel = (v: Pick<LockedVariant, 'size' | 'color'>) => [v.size, v.color].filter(Boolean).join(' / ');
const describe = (v: LockedVariant) => (variantLabel(v) ? `${v.product_name} (${variantLabel(v)})` : v.product_name);

/** Total quantity per variant (an order can list the same variant twice). */
function merge(changes: { variantId: number; delta: number }[]) {
    const byId = new Map<number, number>();
    for (const c of changes) byId.set(c.variantId, (byId.get(c.variantId) ?? 0) + c.delta);
    return [...byId].map(([variantId, delta]) => ({ variantId, delta })).sort((a, b) => a.variantId - b.variantId);
}

async function lockVariants(tx: Executor, ids: number[]): Promise<Map<number, LockedVariant>> {
    if (ids.length === 0) return new Map();
    const rows = await tx<LockedVariant[]>`
        SELECT pv.id, pv.stock, pv.low_stock_threshold, pv.size, pv.color, p.name AS product_name
        FROM product_variants pv
        JOIN products p ON p.id = pv.product_id
        WHERE pv.id IN ${tx(ids)}
        ORDER BY pv.id
        FOR NO KEY UPDATE OF pv
    `;
    return new Map(rows.map((r) => [Number(r.id), { ...r, id: Number(r.id), stock: Number(r.stock), low_stock_threshold: Number(r.low_stock_threshold) }]));
}

async function applyChanges(
    tx: Executor,
    changes: { variantId: number; delta: number }[],
    reason: MovementReason,
    details: MovementDetails,
    after: AfterCommit,
) {
    const merged = merge(changes).filter((c) => c.delta !== 0);
    const locked = await lockVariants(tx, merged.map((c) => c.variantId));

    const missing = merged.find((c) => !locked.has(c.variantId));
    if (missing) throw new BadRequestError(`Variant ${missing.variantId} not found`);

    const shortages = merged
        .filter((c) => locked.get(c.variantId)!.stock + c.delta < 0)
        .map((c) => {
            const v = locked.get(c.variantId)!;
            return { variantId: c.variantId, label: describe(v), available: v.stock, requested: -c.delta };
        });
    if (shortages.length > 0) throw new InsufficientStockError(shortages);

    const crossings: { variant: LockedVariant; stock: number; level: StockLevel }[] = [];
    for (const { variantId, delta } of merged) {
        const variant = locked.get(variantId)!;
        await tx`UPDATE product_variants SET stock = stock + ${delta} WHERE id = ${variantId}`;
        await tx`
            INSERT INTO inventory_movements (variant_id, delta, reason, reference_id, note, created_by)
            VALUES (${variantId}, ${delta}, ${reason}, ${details.referenceId ?? null}, ${details.note ?? null}, ${details.by ?? null})
        `;
        const level = stockCrossing(variant.stock, variant.stock + delta, variant.low_stock_threshold);
        if (level) crossings.push({ variant, stock: variant.stock + delta, level });
    }
    if (crossings.length > 0) await alertLowStock(tx, crossings, after);
}

/** A stock alert for admins and the duty manager; at most one email per variant, person, day and level. */
async function alertLowStock(tx: Executor, crossings: { variant: LockedVariant; stock: number; level: StockLevel }[], after: AfterCommit) {
    const day = new Date().toISOString().slice(0, 10);
    for (const { variant, stock, level } of crossings) {
        const label = variantLabel(variant);
        await alertStaff({
            audience: 'stock',
            type: level === 'out' ? 'OUT_OF_STOCK' : 'LOW_STOCK',
            title: `${level === 'out' ? 'Out of stock' : 'Low stock'}: ${variant.product_name}`,
            body: `${label ? `(${label}) — ` : ''}${stock} unit${stock === 1 ? '' : 's'} remaining`,
            link: '/products',
            data: { variant_id: String(variant.id) },
            dedupeKey: `low-stock:${variant.id}:${day}:${level}`,
            email: (member) => ({
                type: 'LOW_STOCK_ALERT',
                to: member.email,
                name: member.full_name,
                productName: variant.product_name,
                variantLabel: label,
                stock,
                threshold: variant.low_stock_threshold,
            }),
        }, { tx, after });
    }
}

export const inventory = {
    /** Locks the variants and says whether every line could be taken right now. */
    canReserve: async (tx: Executor, lines: StockLine[]): Promise<boolean> => {
        const merged = merge(lines.map((l) => ({ variantId: l.variantId, delta: -l.quantity })));
        const locked = await lockVariants(tx, merged.map((c) => c.variantId));
        return merged.every((c) => (locked.get(c.variantId)?.stock ?? 0) + c.delta >= 0);
    },

    /** Takes stock for an order. Throws `InsufficientStockError` (nothing taken) if any line is short. */
    reserve: (tx: Executor, lines: StockLine[], details: MovementDetails, after: AfterCommit) =>
        applyChanges(tx, lines.map((l) => ({ variantId: l.variantId, delta: -l.quantity })), 'ORDER_PLACED', details, after),

    /** Puts an order's stock back. */
    release: (tx: Executor, lines: StockLine[], details: MovementDetails, after: AfterCommit) =>
        applyChanges(tx, lines.map((l) => ({ variantId: l.variantId, delta: l.quantity })), 'ORDER_CANCELLED', details, after),

    /** A staff change: a count correction, a restock, or a new variant's opening stock. */
    adjust: (
        tx: Executor,
        variantId: number,
        delta: number,
        reason: 'ADMIN_ADJUSTMENT' | 'RESTOCK',
        details: MovementDetails,
        after: AfterCommit,
    ) => applyChanges(tx, [{ variantId, delta }], reason, details, after),
};
