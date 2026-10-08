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
import { adjustStock } from '../../../lib/inventory';
import { createAuditLog } from '../../../lib/audit';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../../lib/errors';
import { roundMoney } from '../../../lib/pricing';
import { pushToMany } from '../../../lib/sse';
import type { AuthUser } from '../../../lib/hono';
import { enqueueEmail, wakeEmailOutbox } from '../../../services/email-outbox';
import { notificationsQueries } from '../../notifications/notifications.queries';
import { paymentsQueries } from '../../payments/payments.queries';
import { LEDGER_ENTRY } from '../../payments/order-balance';
import { ordersQueries, type OrderRow } from '../orders.queries';
import { claimOrderDiscount, releaseDiscountUsage } from '../discount-usage';
import {
    ALL_STATES, adminActions, decide,
    type Actor, type AdminAction, type DecisionContext, type Effect, type NotAllowedReason, type OrderEvent, type OrderState,
} from './transitions';
import { orderAlertRecipients, orderConfirmationJob, paymentFailedJob, staffAlert, staffOrderConfirmedJobs } from './order-messages';

type Executor = typeof sql;

export interface ApplyOptions {
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

/** What to do once the transaction has committed. */
interface AfterCommit {
    wakeOutbox: boolean;
    pushes: { userIds: number[]; event: string; data: object }[];
}

interface Run {
    tx: Executor;
    order: OrderRow;
    before: OrderState;
    next: OrderState;
    event: OrderEvent;
    actor: Actor;
    options: ApplyOptions;
    after: AfterCommit;
    /** Money held for the order, updated as captures are recorded in this run. */
    captured: number;
    staff?: Awaited<ReturnType<typeof orderAlertRecipients>>;
}

export async function applyOrderEvent(orderId: number, event: OrderEvent, actor: Actor, options: ApplyOptions = {}): Promise<ApplyResult> {
    const after: AfterCommit = { wakeOutbox: false, pushes: [] };

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

    if (after.wakeOutbox) wakeEmailOutbox();
    for (const push of after.pushes) pushToMany(push.userIds, push.event, push.data);
    return result;
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
            const items = await lockOrderStock(tx, order.id);
            ctx.stockAvailable = items.every((item) => item.stock >= item.quantity);
        }
    }
    return ctx;
}

/** The order's quantity per variant, with each variant row locked (in id order, to avoid deadlocks). */
async function lockOrderStock(tx: Executor, orderId: number) {
    const variants = await tx<{ id: number; stock: number }[]>`
        SELECT id, stock FROM product_variants
        WHERE id IN (SELECT variant_id FROM order_items WHERE order_id = ${orderId})
        ORDER BY id
        FOR UPDATE
    `;
    const quantities = await tx<{ variant_id: number; quantity: number }[]>`
        SELECT variant_id, SUM(quantity)::int AS quantity FROM order_items
        WHERE order_id = ${orderId} AND variant_id IS NOT NULL
        GROUP BY variant_id
    `;
    const stockById = new Map(variants.map((v) => [Number(v.id), Number(v.stock)]));
    return quantities.map((q) => ({
        variant_id: Number(q.variant_id),
        quantity: Number(q.quantity),
        stock: stockById.get(Number(q.variant_id)) ?? 0,
    }));
}

// ── Effects ─────────────────────────────────────────────────────────────────

async function applyEffect(run: Run, effect: Effect): Promise<void> {
    const { tx, order } = run;
    const orderId = Number(order.id);

    switch (effect.type) {
        case 'reserve_stock': {
            const items = await lockOrderStock(tx, orderId);
            const short = items.find((item) => item.stock < item.quantity);
            if (short) throw new ConflictError(`Not enough stock to take for order ${order.order_number}`);
            const note = run.before.status === 'CANCELLED' ? 'Reinstated after late payment' : null;
            for (const item of items) await adjustStock(tx, item.variant_id, -item.quantity, 'ORDER_PLACED', orderId, note, staffId(run.actor));
            return;
        }
        case 'release_stock': {
            const items = await tx<{ variant_id: number; quantity: number }[]>`
                SELECT variant_id, quantity FROM order_items WHERE order_id = ${orderId} AND variant_id IS NOT NULL
            `;
            const note = run.event.type === 'expired' ? 'Unpaid order expired' : 'Order cancelled';
            for (const item of items) await adjustStock(tx, item.variant_id, item.quantity, 'ORDER_CANCELLED', orderId, note, staffId(run.actor));
            return;
        }
        case 'claim_discount':
            await claimOrderDiscount(tx, order as any, effect.allowOverLimit);
            return;
        case 'release_discount':
            await releaseDiscountUsage(tx, orderId);
            return;

        case 'record_capture': {
            await paymentsQueries.createLedgerEntry({
                order_id: orderId,
                payment_transaction_id: effect.transactionId ?? null,
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
            if (await enqueueEmail(job, { tx, dedupeKey: effect.dedupeKey })) run.after.wakeOutbox = true;
            return;
        }
        case 'email_staff_order_confirmed': {
            const items = await ordersQueries.findItemsByOrderId(orderId);
            const itemCount = items.reduce((sum, item) => sum + Number(item.quantity), 0);
            for (const { job, dedupeKey } of await staffOrderConfirmedJobs(order, itemCount)) {
                if (await enqueueEmail(job, { tx, dedupeKey })) run.after.wakeOutbox = true;
            }
            const staff = await recipients(run);
            await notifyStaff(run, staff, {
                type: 'NEW_ORDER',
                title: `New order ${order.order_number ?? `#${orderId}`}`,
                body: `Paid — KES ${run.captured.toFixed(2)}`,
            });
            run.after.pushes.push({ userIds: staff.map((u) => Number(u.id)), event: 'order_paid', data: { order_id: orderId } });
            return;
        }
        case 'alert_staff':
            await notifyStaff(run, await recipients(run), staffAlert(effect.kind, order, run.event, { captured: run.captured }));
            return;

        case 'audit':
            await createAuditLog({
                actor: auditActor(run.actor),
                action: effect.action,
                entityType: 'order',
                entityId: orderId,
                before: { status: run.before.status, payment_status: run.before.payment },
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

async function recipients(run: Run) {
    run.staff ??= await orderAlertRecipients();
    return run.staff;
}

async function notifyStaff(run: Run, staff: { id: number | string }[], message: { type: string; title: string; body: string }) {
    if (staff.length === 0) return;
    const userIds = staff.map((u) => Number(u.id));
    const created = await notificationsQueries.create(userIds.map((id) => ({
        recipient_id: id,
        ...message,
        data: { link: '/orders', order_id: String(run.order.id) },
    })), run.tx);
    run.after.pushes.push({ userIds, event: 'notification', data: { notifications: created } });
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
