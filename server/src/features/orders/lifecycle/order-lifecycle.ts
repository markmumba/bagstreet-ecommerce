/**
 * Order lifecycle adapter (docs/adr/0001-order-lifecycle-owns-order-state.md).
 *
 * `applyOrderEvent` is the one way an existing Order's state changes. In a single transaction it
 * locks the order row, loads the facts the transition table needs, asks `decide`, then applies the
 * effects (stock, discount use, ledger, email outbox, staff alerts, audit) and the new state.
 * Either all of it happens or none of it does. Live pushes and the outbox wake-up happen after commit.
 *
 * Applying the same event twice is safe: the table answers "unchanged" for repeats.
 */
import { PAYMENT_STATUS } from 'shared/dist';
import { sql } from '../../../lib/db';
import { env } from '../../../config/env';
import { inventory, type StockLine } from '../../inventory/inventory';
import { AfterCommit } from '../../../lib/after-commit';
import { createAuditLog } from '../../../lib/audit';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../../lib/errors';
import { roundMoney } from '../../../lib/pricing';
import type { AuthUser } from '../../../lib/hono';
import { enqueueEmail } from '../../../services/email-outbox';
import { paymentsQueries } from '../../payments/payments.queries';
import { LEDGER_ENTRY } from '../../payments/order-balance';
import { ordersQueries, type OrderDraft, type OrderRow } from '../orders.queries';
import { claimOrderDiscount, releaseDiscountUsage } from '../discount-usage';
import {
    ALL_STATES, adminActions, decide, decideCreation,
    type Actor, type AdminAction, type DecisionContext, type Effect, type NotAllowedReason, type OrderEvent, type OrderState,
} from './transitions';
import { orderConfirmationJob, paymentFailedJob, staffAlert, staffOrderConfirmedEmail } from './order-messages';
import { alertStaff } from '../../staff-alerts/staff-alerts';

type Executor = typeof sql;

export interface ApplyOptions {
    /** The payment_transactions row a recorded capture belongs to, when the event doesn't carry it. */
    paymentTransactionId?: number | null;
    /** Extra provider details stored on a recorded capture (tracking ids, payment method…). */
    paymentMetadata?: Record<string, unknown>;
    /** Extra details for the audit log entry (e.g. why the expiry job acted). */
    auditMetadata?: Record<string, unknown>;
}

export type ApplyResult =
    | { outcome: 'changed'; before: OrderState; state: OrderState; order: OrderRow }
    /** `noop`: nothing at all happened (a repeat); otherwise effects were applied without a state change. */
    | { outcome: 'unchanged'; state: OrderState; order: OrderRow; noop: boolean }
    | { outcome: 'not_allowed'; state: OrderState; order: OrderRow; reason: NotAllowedReason; message: string };

const VALID_STATES = new Set(ALL_STATES.map((s) => `${s.status}/${s.payment}`));

/** An order row's Order state. Throws for a combination the lifecycle doesn't know. */
export function orderStateOf(order: { id: number | string; status: string; payment_status: string }): OrderState {
    const key = `${order.status}/${order.payment_status}`;
    if (!VALID_STATES.has(key)) throw new Error(`Order ${order.id} is in an unknown state ${key}`);
    return { status: order.status, payment: order.payment_status } as OrderState;
}

/** Admin actions for an order row; none for a state the lifecycle doesn't know. */
export function adminActionsFor(order: { id: number | string; status: string; payment_status: string }): AdminAction[] {
    try {
        return adminActions(orderStateOf(order));
    } catch {
        return [];
    }
}

/** For HTTP handlers: a refused event becomes a 403 (who) or 400 (what), with the table's reason. */
export function requireAllowed(result: ApplyResult): Exclude<ApplyResult, { outcome: 'not_allowed' }> {
    if (result.outcome !== 'not_allowed') return result;
    if (result.reason === 'not_permitted') throw new ForbiddenError(result.message);
    throw new BadRequestError(result.message);
}

interface Run {
    tx: Executor;
    order: OrderRow;
    /** Null when the order is being created. */
    before: OrderState | null;
    next: OrderState;
    event: OrderEvent;
    actor: Actor;
    options: ApplyOptions;
    after: AfterCommit;
    /** Money held for the order, updated as captures are recorded in this run. */
    captured: number;
}

export async function applyOrderEvent(orderId: number, event: OrderEvent, actor: Actor, options: ApplyOptions = {}): Promise<ApplyResult> {
    const after = new AfterCommit();

    const result = await sql.begin(async (tx: Executor) => {
        const [order] = await tx<OrderRow[]>`SELECT * FROM orders WHERE id = ${orderId} FOR UPDATE`;
        if (!order) throw new NotFoundError('Order', orderId);
        const state = orderStateOf(order);
        const ctx = await loadContext(tx, order, state, event);
        const decision = decide(state, event, actor, ctx, String(order.id));

        if (decision.kind === 'not_allowed') {
            return { outcome: 'not_allowed', state, order, reason: decision.reason, message: decision.message } satisfies ApplyResult;
        }

        const next = decision.kind === 'transition' ? decision.next : state;
        const run: Run = { tx, order, before: state, next, event, actor, options, after, captured: ctx.captured };
        for (const effect of decision.effects) await applyEffect(run, effect);

        if (decision.kind === 'unchanged') {
            return { outcome: 'unchanged', state, order, noop: decision.effects.length === 0 } satisfies ApplyResult;
        }

        const [updated] = await tx<OrderRow[]>`
            UPDATE orders
            SET status = ${next.status},
                payment_status = ${next.payment},
                paid_at = CASE WHEN ${next.payment === PAYMENT_STATUS.PAID} THEN COALESCE(paid_at, CURRENT_TIMESTAMP) ELSE paid_at END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ${order.id}
            RETURNING *
        `;
        return { outcome: 'changed', before: state, state: next, order: updated ?? order } satisfies ApplyResult;
    }) as unknown as ApplyResult;

    after.run();
    return result;
}

export type CreationEvent = Extract<OrderEvent, { type: 'placed_online' | 'walk_in_sale' }>;

/**
 * Creates an order. The transition table decides who may create it and its starting state; the
 * effects (take stock, claim the discount, record a walk-in's payment, audit) are applied in the
 * same transaction that stores it, exactly as for any other Order event.
 */
export async function createOrder(
    draft: OrderDraft,
    event: CreationEvent,
    actor: Actor,
    options: Pick<ApplyOptions, 'paymentMetadata'> = {},
): Promise<OrderRow> {
    const decision = decideCreation(event, actor, 'new');
    if (decision.kind === 'not_allowed') throw new ForbiddenError(decision.message);
    if (decision.kind !== 'transition') throw new Error(`"${event.type}" did not produce a starting state`);

    const after = new AfterCommit();
    const order = await ordersQueries.insertOrder(draft, decision.next, async (tx, created, paymentTransactionId) => {
        const run: Run = {
            tx, order: created, before: null, next: decision.next, event, actor, after, captured: 0,
            options: { ...options, paymentTransactionId },
        };
        for (const effect of decision.effects) await applyEffect(run, effect);
    });
    after.run();
    return order;
}

// ── Facts for the decision ─────────────────────────────────────────────────

async function loadContext(tx: Executor, order: OrderRow, state: OrderState, event: OrderEvent): Promise<DecisionContext> {
    const entries = await tx<{ entry_type: string; direction: string; amount: string }[]>`
        SELECT entry_type, direction, amount FROM payment_ledger_entries WHERE order_id = ${order.id}
    `;
    const sum = (type: string, direction: string) => roundMoney(entries
        .filter((e) => e.entry_type === type && e.direction === direction)
        .reduce((total, e) => total + Number(e.amount), 0));

    const orderTotal = roundMoney(Number(order.total_amount));
    const captures = sum(LEDGER_ENTRY.PAYMENT_CAPTURED, 'CREDIT');
    // Orders paid before the ledger existed have no capture entry; trust their PAID flag.
    const legacyPaid = captures === 0 && state.payment === 'PAID';
    const captured = roundMoney((legacyPaid ? orderTotal : captures) - sum(LEDGER_ENTRY.PAYMENT_REVERSED, 'DEBIT'));

    const ctx: DecisionContext = {
        orderTotal,
        currency: env.PESAPAL_CURRENCY,
        captured,
        refunded: sum(LEDGER_ENTRY.REFUND_ISSUED, 'DEBIT'),
    };

    if (event.type === 'refund_recorded') {
        const [seen] = await tx`
            SELECT 1 FROM payment_ledger_entries
            WHERE entry_type = ${LEDGER_ENTRY.REFUND_ISSUED} AND reference = ${refundReference(event.idempotencyKey)}
            LIMIT 1
        `;
        ctx.refundAlreadyRecorded = Boolean(seen);
    }

    if (event.type === 'payment_captured') {
        // Capture references are unique across all orders (ledger index), so check globally.
        const [seen] = await tx`
            SELECT 1 FROM payment_ledger_entries
            WHERE entry_type = ${LEDGER_ENTRY.PAYMENT_CAPTURED} AND reference = ${event.reference}
            LIMIT 1
        `;
        ctx.captureAlreadyRecorded = Boolean(seen);
        if (state.status === 'CANCELLED') {
            // Late payment: can the order be reinstated? Variants stay locked until commit.
            ctx.stockAvailable = await inventory.canReserve(tx, await orderStockLines(tx, order.id));
        }
    }
    return ctx;
}

/** What the order holds (or would take) from stock. */
async function orderStockLines(tx: Executor, orderId: number): Promise<StockLine[]> {
    const rows = await tx<{ variant_id: number; quantity: number }[]>`
        SELECT variant_id, quantity FROM order_items WHERE order_id = ${orderId} AND variant_id IS NOT NULL
    `;
    return rows.map((r) => ({ variantId: Number(r.variant_id), quantity: Number(r.quantity) }));
}

// ── Effects ─────────────────────────────────────────────────────────────────

async function applyEffect(run: Run, effect: Effect): Promise<void> {
    const { tx, order } = run;
    const orderId = Number(order.id);

    switch (effect.type) {
        case 'reserve_stock':
            await inventory.reserve(tx, await orderStockLines(tx, orderId), {
                referenceId: orderId,
                note: run.before?.status === 'CANCELLED' ? 'Reinstated after late payment'
                    : run.event.type === 'walk_in_sale' ? 'Walk-in sale' : null,
                by: staffId(run.actor),
            }, run.after);
            return;
        case 'release_stock':
            await inventory.release(tx, await orderStockLines(tx, orderId), {
                referenceId: orderId,
                note: run.event.type === 'expired' ? 'Unpaid order expired' : 'Order cancelled',
                by: staffId(run.actor),
            }, run.after);
            return;
        case 'claim_discount':
            await claimOrderDiscount(tx, order as any, effect.allowOverLimit);
            return;
        case 'release_discount':
            await releaseDiscountUsage(tx, orderId);
            return;

        case 'record_capture': {
            await paymentsQueries.createLedgerEntry({
                order_id: orderId,
                payment_transaction_id: effect.transactionId ?? run.options.paymentTransactionId ?? null,
                entry_type: LEDGER_ENTRY.PAYMENT_CAPTURED,
                direction: 'CREDIT',
                amount: effect.amount,
                currency: effect.currency,
                reference: effect.reference,
                metadata: { order_id: orderId, event: run.event.type, order_state: run.next, ...run.options.paymentMetadata },
            }, tx);
            run.captured = roundMoney(run.captured + effect.amount);
            return;
        }
        case 'record_refund': {
            const entry = await paymentsQueries.createLedgerEntry({
                order_id: orderId,
                entry_type: LEDGER_ENTRY.REFUND_ISSUED,
                direction: 'DEBIT',
                amount: effect.amount,
                currency: env.PESAPAL_CURRENCY,
                reference: refundReference(effect.idempotencyKey),
                metadata: {
                    method: effect.method,
                    external_reference: effect.externalReference || null,
                    reason: effect.reason,
                    recorded_by: staffId(run.actor),
                    recorded_by_email: run.actor.kind === 'staff' ? run.actor.email ?? null : null,
                },
            }, tx);
            if (!entry) throw new ConflictError('This refund has already been recorded');
            return;
        }
        case 'record_reversal':
            await paymentsQueries.createLedgerEntry({
                order_id: orderId,
                entry_type: LEDGER_ENTRY.PAYMENT_REVERSED,
                direction: 'DEBIT',
                amount: effect.amount,
                currency: env.PESAPAL_CURRENCY,
                reference: effect.reference,
                metadata: { order_id: orderId, ...run.options.paymentMetadata },
            }, tx);
            return;

        case 'email_customer': {
            const job = effect.kind === 'order_confirmation'
                ? await orderConfirmationJob(order, await ordersQueries.findItemsByOrderId(orderId))
                : await paymentFailedJob(order, run.event.type === 'payment_failed' ? run.event.reason : null);
            if (!job) return;
            if (await enqueueEmail(job, { tx, dedupeKey: effect.dedupeKey })) run.after.wakeOutbox();
            return;
        }
        case 'email_staff_order_confirmed': {
            const items = await ordersQueries.findItemsByOrderId(orderId);
            const itemCount = items.reduce((sum, item) => sum + Number(item.quantity), 0);
            const staffIds = await alertStaff({
                audience: 'orders',
                type: 'NEW_ORDER',
                title: `New order ${order.order_number ?? `#${orderId}`}`,
                body: `Paid — KES ${run.captured.toFixed(2)}`,
                link: '/orders',
                data: { order_id: String(orderId) },
                dedupeKey: `admin-order-confirmed:${orderId}`,
                email: staffOrderConfirmedEmail(order, itemCount),
            }, { tx, after: run.after });
            run.after.push(staffIds, 'order_paid', { order_id: orderId });
            return;
        }
        case 'alert_staff': {
            const message = staffAlert(effect.kind, order, run.event, { captured: run.captured });
            // A repeat payment can happen more than once on an order; the others are once per order.
            const occurrence = effect.kind === 'duplicate_payment' && run.event.type === 'payment_captured' ? `:${run.event.reference}` : '';
            await alertStaff({
                audience: 'money',
                ...message,
                link: '/orders',
                data: { order_id: String(orderId) },
                dedupeKey: `staff-alert:${message.type}:${orderId}${occurrence}`,
            }, { tx, after: run.after });
            return;
        }

        case 'audit':
            await createAuditLog({
                actor: auditActor(run.actor),
                action: effect.action,
                entityType: 'order',
                entityId: orderId,
                before: run.before ? { status: run.before.status, payment_status: run.before.payment } : null,
                after: { status: run.next.status, payment_status: run.next.payment },
                metadata: {
                    event: describeEvent(run.event),
                    actor: run.actor.kind,
                    ...(effect.note ? { note: effect.note } : {}),
                    ...run.options.auditMetadata,
                },
            }, tx);
            return;
    }
}

/** One ledger reference per refund form submission, so a double submit records one refund. */
function refundReference(idempotencyKey: string) {
    return `refund:${idempotencyKey}`;
}

function staffId(actor: Actor): number | null {
    return actor.kind === 'staff' ? Number(actor.userId) : null;
}

function auditActor(actor: Actor): AuthUser | null {
    if (actor.kind !== 'staff') return null;
    return { sub: actor.userId, email: actor.email as string, role: actor.role };
}

/** The event as stored in the audit log (no free-text customer data beyond what staff typed). */
function describeEvent(event: OrderEvent): Record<string, unknown> {
    switch (event.type) {
        case 'payment_captured':
            return { type: event.type, amount: event.amount, currency: event.currency, reference: event.reference };
        case 'payment_reversed':
            return { type: event.type, reference: event.reference, amount: event.amount ?? null };
        case 'payment_failed':
            return { type: event.type, attempt: event.attemptReference, reason: event.reason ?? null };
        case 'refund_recorded':
            return { type: event.type, amount: event.amount, method: event.method, reason: event.reason };
        default:
            return { ...event };
    }
}
