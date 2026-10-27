import type { GiftVoucherMovementKind, GiftVoucherStatus, GiftVoucherSummaryResponse } from 'shared/dist';
import { sql } from '../../lib/db';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors';
import { roundMoney } from '../../lib/pricing';
import {
    formatVoucherCode, generateVoucherCode, hashVoucherCode, normaliseVoucherCode, voucherExpiryFrom, type VoucherRuleRow,
} from './voucher-rules';

type Executor = typeof sql;

export interface GiftVoucherRow extends VoucherRuleRow {
    id: number;
    code_last4: string;
    initial_amount: string;
    balance: string;
    currency: string;
    expires_at: string;
    voided_at: string | null;
    void_reason: string | null;
    recipient_name: string | null;
    recipient_phone: string | null;
    recipient_email: string | null;
    message: string | null;
    purchaser_name: string | null;
    sold_via: string;
    sale_payment_method: string;
    sale_reference: string | null;
    issued_by: number | null;
    issued_by_email: string | null;
    purchase_order_id: number | null;
    purchase_order_number: string | null;
    /** Set aside for unpaid orders. */
    held: string;
    created_at: string;
}

export interface GiftVoucherMovementRow {
    id: number;
    kind: GiftVoucherMovementKind;
    delta: string;
    amount: string;
    balance_after: string;
    order_id: number | null;
    order_number: string | null;
    note: string | null;
    created_by_email: string | null;
    created_at: string;
}

/** Status as SQL, matching voucherStatus() in voucher-rules.ts. */
const STATUS_SQL: Record<GiftVoucherStatus, string> = {
    voided: 'v.voided_at IS NOT NULL',
    expired: 'v.voided_at IS NULL AND v.expires_at <= CURRENT_TIMESTAMP',
    used: 'v.voided_at IS NULL AND v.expires_at > CURRENT_TIMESTAMP AND v.balance <= 0',
    active: 'v.voided_at IS NULL AND v.expires_at > CURRENT_TIMESTAMP AND v.balance > 0',
};

/** Money set aside for unpaid orders, per voucher. */
const HELD_SQL = `
    COALESCE((SELECT SUM(CASE m.kind WHEN 'HELD' THEN m.amount WHEN 'REDEEMED' THEN -m.amount WHEN 'RELEASED' THEN -m.amount ELSE 0 END)
              FROM gift_voucher_movements m WHERE m.voucher_id = v.id), 0)`;

async function selectVouchers(db: Executor, where: string, params: unknown[], tail = ''): Promise<GiftVoucherRow[]> {
    return await db.unsafe(`
        SELECT v.*, u.email AS issued_by_email, po.order_number AS purchase_order_number, ${HELD_SQL} AS held
        FROM gift_vouchers v
        LEFT JOIN users u ON u.id = v.issued_by
        LEFT JOIN orders po ON po.id = v.purchase_order_id
        WHERE ${where}
        ${tail}
    `, params) as GiftVoucherRow[];
}

export interface NewVoucher {
    amount: number;
    salePaymentMethod: string;
    saleReference: string | null;
    purchaserName: string | null;
    recipientName: string | null;
    recipientPhone: string | null;
    recipientEmail: string | null;
    message: string | null;
    issuedBy: number | null;
    soldVia: 'SHOP' | 'ONLINE';
    purchaseOrderId: number | null;
    /** For the ISSUED movement. */
    note: string;
}

/** Creates a voucher and its ISSUED movement inside `tx`. Returns the full code, which is never stored. */
export async function insertVoucher(tx: Executor, data: NewVoucher): Promise<{ id: number; code: string; last4: string; expiresAt: Date }> {
    const amount = roundMoney(data.amount);
    const expiresAt = voucherExpiryFrom(new Date());
    // 2^80 possible codes: a clash is practically impossible, but never reuse one.
    for (let attempt = 0; attempt < 3; attempt++) {
        const bare = normaliseVoucherCode(generateVoucherCode())!;
        const [created] = await tx<{ id: number }[]>`
            INSERT INTO gift_vouchers (
                code_hash, code_last4, initial_amount, balance, expires_at, recipient_name, recipient_phone,
                recipient_email, message, purchaser_name, sale_payment_method, sale_reference, issued_by, sold_via, purchase_order_id
            )
            VALUES (
                ${hashVoucherCode(bare)}, ${bare.slice(-4)}, ${amount}, ${amount}, ${expiresAt},
                ${data.recipientName}, ${data.recipientPhone}, ${data.recipientEmail}, ${data.message},
                ${data.purchaserName}, ${data.salePaymentMethod}, ${data.saleReference}, ${data.issuedBy}, ${data.soldVia}, ${data.purchaseOrderId}
            )
            ON CONFLICT (code_hash) DO NOTHING
            RETURNING id
        `;
        if (!created) continue;
        await tx`
            INSERT INTO gift_voucher_movements (voucher_id, kind, delta, amount, balance_after, created_by, note)
            VALUES (${created.id}, 'ISSUED', ${amount}, ${amount}, ${amount}, ${data.issuedBy}, ${data.note})
        `;
        return { id: Number(created.id), code: formatVoucherCode(bare), last4: bare.slice(-4), expiresAt };
    }
    throw new Error('Could not generate a unique gift voucher code');
}

/** Cancels whatever is left on a voucher inside `tx` (the caller has locked it). No-op if already cancelled. */
export async function voidVoucher(tx: Executor, id: number, reason: string, by: number | null): Promise<void> {
    const [voucher] = await tx<{ balance: string; voided_at: string | null }[]>`SELECT balance, voided_at FROM gift_vouchers WHERE id = ${id}`;
    if (!voucher || voucher.voided_at) return;
    const balance = roundMoney(Number(voucher.balance));
    await tx`
        UPDATE gift_vouchers
        SET balance = 0, voided_at = CURRENT_TIMESTAMP, void_reason = ${reason}, voided_by = ${by}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
    `;
    await tx`
        INSERT INTO gift_voucher_movements (voucher_id, kind, delta, amount, balance_after, created_by, note)
        VALUES (${id}, 'VOIDED', ${-balance}, ${balance}, 0, ${by}, ${reason})
    `;
}

export const giftVouchersQueries = {
    /** The voucher a typed code belongs to; undefined for anything that isn't a known code. */
    findByCode: async (input: string, db: Executor = sql): Promise<GiftVoucherRow | undefined> => {
        const bare = normaliseVoucherCode(input);
        if (!bare) return undefined;
        const [row] = await selectVouchers(db, 'v.code_hash = $1', [hashVoucherCode(bare)]);
        return row;
    },

    findById: async (id: number, db: Executor = sql): Promise<GiftVoucherRow | undefined> => {
        const [row] = await selectVouchers(db, 'v.id = $1', [id]);
        return row;
    },

    movements: async (voucherId: number): Promise<GiftVoucherMovementRow[]> => {
        return await sql<GiftVoucherMovementRow[]>`
            SELECT m.*, o.order_number, u.email AS created_by_email
            FROM gift_voucher_movements m
            LEFT JOIN orders o ON o.id = m.order_id
            LEFT JOIN users u ON u.id = m.created_by
            WHERE m.voucher_id = ${voucherId}
            ORDER BY m.created_at DESC, m.id DESC
        `;
    },

    list: async (options: { page: number; limit: number; status?: GiftVoucherStatus; search?: string }) => {
        const conditions = ['TRUE'];
        const params: unknown[] = [];
        if (options.status) conditions.push(STATUS_SQL[options.status]);
        if (options.search?.trim()) {
            params.push(`%${options.search.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
            const p = `$${params.length}`;
            conditions.push(`(v.code_last4 ILIKE ${p} OR v.recipient_name ILIKE ${p} OR v.recipient_phone ILIKE ${p}
                OR v.recipient_email ILIKE ${p} OR v.purchaser_name ILIKE ${p} OR v.sale_reference ILIKE ${p})`);
        }
        const where = conditions.join(' AND ');
        const [count] = await sql.unsafe(`SELECT COUNT(*)::int AS total FROM gift_vouchers v WHERE ${where}`, params) as { total: number }[];
        params.push(options.limit, (options.page - 1) * options.limit);
        const rows = await selectVouchers(sql, where, params,
            `ORDER BY v.created_at DESC, v.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`);
        return { rows, total: Number(count?.total ?? 0) };
    },

    /** Issues a voucher sold in the shop. Returns the full code: the only time it exists outside the holder's hands. */
    issue: async (data: Omit<NewVoucher, 'soldVia' | 'purchaseOrderId' | 'note'> & { issuedBy: number }): Promise<{ voucher: GiftVoucherRow; code: string }> => {
        return await sql.begin(async (tx: Executor) => {
            const { id, code } = await insertVoucher(tx, {
                ...data, soldVia: 'SHOP', purchaseOrderId: null, note: `Sold in the shop (${data.salePaymentMethod})`,
            });
            return { voucher: (await giftVouchersQueries.findById(id, tx))!, code };
        }) as { voucher: GiftVoucherRow; code: string };
    },

    /** A lost or exposed code: the voucher gets a new code, keeping its balance, expiry and history. */
    replaceCode: async (id: number, by: number): Promise<{ voucher: GiftVoucherRow; code: string; oldLast4: string }> => {
        return await sql.begin(async (tx: Executor) => {
            const [locked] = await tx<{ code_last4: string; balance: string; voided_at: string | null }[]>`
                SELECT code_last4, balance, voided_at FROM gift_vouchers WHERE id = ${id} FOR UPDATE
            `;
            if (!locked) throw new NotFoundError('Gift voucher', id);
            if (locked.voided_at) throw new BadRequestError('A cancelled gift voucher cannot get a new code');
            for (let attempt = 0; attempt < 3; attempt++) {
                const bare = normaliseVoucherCode(generateVoucherCode())!;
                const [updated] = await tx`
                    UPDATE gift_vouchers SET code_hash = ${hashVoucherCode(bare)}, code_last4 = ${bare.slice(-4)}, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ${id} AND NOT EXISTS (SELECT 1 FROM gift_vouchers WHERE code_hash = ${hashVoucherCode(bare)})
                    RETURNING id
                `;
                if (!updated) continue;
                await tx`
                    INSERT INTO gift_voucher_movements (voucher_id, kind, delta, amount, balance_after, created_by, note)
                    VALUES (${id}, 'CODE_REPLACED', 0, 0, ${locked.balance}, ${by}, ${`Replaced code ····${locked.code_last4}`})
                `;
                return { voucher: (await giftVouchersQueries.findById(id, tx))!, code: formatVoucherCode(bare), oldLast4: locked.code_last4 };
            }
            throw new Error('Could not generate a unique gift voucher code');
        }) as { voucher: GiftVoucherRow; code: string; oldLast4: string };
    },

    /** Cancels a voucher: its balance can no longer be spent. Refused while an unpaid order holds part of it. */
    void: async (id: number, reason: string, by: number): Promise<{ before: GiftVoucherRow; after: GiftVoucherRow }> => {
        return await sql.begin(async (tx: Executor) => {
            const [locked] = await tx`SELECT id FROM gift_vouchers WHERE id = ${id} FOR UPDATE`;
            if (!locked) throw new NotFoundError('Gift voucher', id);
            const before = (await giftVouchersQueries.findById(id, tx))!;
            if (before.voided_at) throw new ConflictError('This gift voucher is already cancelled');
            if (roundMoney(Number(before.held)) > 0) {
                throw new BadRequestError('An unpaid order is using this voucher. Try again once it is paid or has expired.');
            }
            await voidVoucher(tx, id, reason, by);
            return { before, after: (await giftVouchersQueries.findById(id, tx))! };
        }) as { before: GiftVoucherRow; after: GiftVoucherRow };
    },

    /** Corrects a balance (e.g. a mistake at issue), with the reason logged. */
    adjust: async (id: number, delta: number, reason: string, by: number): Promise<{ before: GiftVoucherRow; after: GiftVoucherRow }> => {
        return await sql.begin(async (tx: Executor) => {
            const [locked] = await tx`SELECT id FROM gift_vouchers WHERE id = ${id} FOR UPDATE`;
            if (!locked) throw new NotFoundError('Gift voucher', id);
            const before = (await giftVouchersQueries.findById(id, tx))!;
            if (before.voided_at) throw new BadRequestError('A cancelled gift voucher cannot be adjusted');
            const balanceAfter = roundMoney(Number(before.balance) + delta);
            if (balanceAfter < 0) throw new BadRequestError(`The balance is KES ${Number(before.balance).toFixed(2)}; it cannot go below zero`);
            await tx`UPDATE gift_vouchers SET balance = ${balanceAfter}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}`;
            await tx`
                INSERT INTO gift_voucher_movements (voucher_id, kind, delta, amount, balance_after, created_by, note)
                VALUES (${id}, 'ADJUSTED', ${roundMoney(delta)}, ${Math.abs(roundMoney(delta))}, ${balanceAfter}, ${by}, ${reason})
            `;
            return { before, after: (await giftVouchersQueries.findById(id, tx))! };
        }) as { before: GiftVoucherRow; after: GiftVoucherRow };
    },

    /** Voucher liability and totals for the admin. */
    summary: async (): Promise<GiftVoucherSummaryResponse> => {
        const [row] = await sql.unsafe(`
            SELECT
                COALESCE(SUM(v.balance + ${HELD_SQL}) FILTER (WHERE v.voided_at IS NULL AND v.expires_at > CURRENT_TIMESTAMP), 0) AS liability,
                COALESCE(SUM(v.initial_amount) FILTER (WHERE v.voided_at IS NULL), 0) AS sold,
                COALESCE(SUM(v.balance) FILTER (WHERE ${STATUS_SQL.expired}), 0) AS expired_unspent,
                COUNT(*) FILTER (WHERE ${STATUS_SQL.active})::int AS active,
                COUNT(*) FILTER (WHERE ${STATUS_SQL.used})::int AS used,
                COUNT(*) FILTER (WHERE ${STATUS_SQL.expired})::int AS expired,
                COUNT(*) FILTER (WHERE ${STATUS_SQL.voided})::int AS voided
            FROM gift_vouchers v
        `) as Record<string, string | number>[];
        const [spent] = await sql<{ redeemed: string }[]>`
            SELECT COALESCE(SUM(CASE kind WHEN 'REDEEMED' THEN amount WHEN 'RETURNED' THEN -amount ELSE 0 END), 0) AS redeemed
            FROM gift_voucher_movements
        `;
        const n = (key: string) => roundMoney(Number(row?.[key] ?? 0));
        return {
            liability: n('liability'),
            sold: n('sold'),
            redeemed: roundMoney(Number(spent?.redeemed ?? 0)),
            expired_unspent: n('expired_unspent'),
            counts: { active: Number(row?.active ?? 0), used: Number(row?.used ?? 0), expired: Number(row?.expired ?? 0), voided: Number(row?.voided ?? 0) },
        };
    },
};
