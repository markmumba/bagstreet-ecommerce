/**
 * Order lifecycle: the transition table (docs/adr/0001-order-lifecycle-owns-order-state.md).
 *
 * Pure: given an Order state, an Order event, who caused it and the facts the decision needs,
 * returns the next state and the effects that must happen with it — or why it isn't allowed.
 * No database here; the lifecycle adapter loads the facts, locks the order and applies the effects
 * in one transaction. Vocabulary: see CONTEXT.md.
 */
import { assessCapturedAmount } from '../../payments/order-balance';
import { roundMoney } from '@server/lib/pricing';

// ── State ───────────────────────────────────────────────────────────────────

/**
 * Fulfilment statuses an order can actually reach. SHIPPED is "out for delivery": the rider has left.
 * (PROCESSING exists in the enum but is unused.)
 */
export type FulfilmentStatus = 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED';
export type PaymentState = 'UNPAID' | 'PAID' | 'FAILED' | 'HELD' | 'REVERSED';

/** An Order's state is both columns together — never one alone. */
export interface OrderState {
    status: FulfilmentStatus;
    payment: PaymentState;
}

// ── Actors ──────────────────────────────────────────────────────────────────

export type Actor =
    | { kind: 'payment_provider' }
    | { kind: 'system' }
    /** `checkout`: placing an order; `account`: from their account page; `received_link`: the signed link in the confirmation email. */
    | { kind: 'customer'; isOwner: boolean; via: 'checkout' | 'account' | 'received_link' }
    | { kind: 'staff'; userId: string; role: 'ADMIN' | 'MANAGER'; email?: string };

// ── Events ──────────────────────────────────────────────────────────────────

export type OrderEvent =
    | { type: 'placed_online' }
    | { type: 'walk_in_sale'; amount: number; currency: string; reference: string }
    | { type: 'payment_captured'; amount: number; currency: string; reference: string; transactionId?: number | null }
    | { type: 'payment_failed'; attemptReference: string; reason?: string | null }
    | { type: 'payment_reversed'; reference: string; amount?: number }
    | { type: 'expired' }
    | { type: 'cancelled'; reason?: string }
    | { type: 'marked_paid'; reference?: string }
    | { type: 'dispatched' }
    | { type: 'delivered' }
    | { type: 'refund_recorded'; amount: number; method: string; reason: string; externalReference?: string; idempotencyKey: string }
    | { type: 'written_off'; note: string };

export type OrderEventType = OrderEvent['type'];

/** Facts the adapter loads (inside the transaction, with the order row locked) before deciding. */
export interface DecisionContext {
    orderTotal: number;
    currency: string;
    /** Money captured for the order so far (ledger), before this event. */
    captured: number;
    /** Money refunded so far (ledger). */
    refunded: number;
    /** For a Late payment: are all of the order's items still in stock? */
    stockAvailable?: boolean;
    /** This exact provider reference has already been recorded as a capture. */
    captureAlreadyRecorded?: boolean;
    /** A refund with this idempotency key is already on record (double submit / retry). */
    refundAlreadyRecorded?: boolean;
}

// ── Effects ─────────────────────────────────────────────────────────────────

export type StaffAlertKind = 'payment_held' | 'overpaid' | 'refund_needed' | 'payment_reversed' | 'duplicate_payment';
export type CustomerEmailKind = 'order_confirmation' | 'payment_failed' | 'order_expired';

/** Things that must happen in the same transaction as the state change (executed by the adapter). */
export type Effect =
    | { type: 'reserve_stock' }
    | { type: 'release_stock' }
    | { type: 'claim_discount'; allowOverLimit: boolean }
    | { type: 'release_discount' }
    | { type: 'record_capture'; amount: number; currency: string; reference: string; transactionId?: number | null }
    | { type: 'record_refund'; amount: number; method: string; reason: string; externalReference?: string; idempotencyKey: string }
    | { type: 'record_reversal'; amount: number; reference: string }
    | { type: 'email_customer'; kind: CustomerEmailKind; dedupeKey: string }
    | { type: 'email_staff_order_confirmed' }
    | { type: 'alert_staff'; kind: StaffAlertKind }
    | { type: 'audit'; action: string; note?: string };

// ── Outcome ─────────────────────────────────────────────────────────────────

export type NotAllowedReason =
    | 'not_permitted'          // this actor may not cause this event
    | 'invalid_in_state'       // the event makes no sense in this state
    | 'refund_instead'         // a paid order is refunded, not cancelled
    | 'exceeds_refundable';    // refund larger than what's left to refund

export type Decision =
    | { kind: 'transition'; next: OrderState; effects: Effect[] }
    | { kind: 'unchanged'; effects: Effect[] }   // repeat of something already done, or a note
    | { kind: 'not_allowed'; reason: NotAllowedReason; message: string };

// ── Helpers ─────────────────────────────────────────────────────────────────

const isStaffAdmin = (a: Actor) => a.kind === 'staff' && a.role === 'ADMIN';
const isStaff = (a: Actor) => a.kind === 'staff';
const isProvider = (a: Actor) => a.kind === 'payment_provider' || a.kind === 'system';
const awaitingPayment = (s: OrderState) => s.status === 'PENDING' && (s.payment === 'UNPAID' || s.payment === 'FAILED');

const notAllowed = (reason: NotAllowedReason, message: string): Decision => ({ kind: 'not_allowed', reason, message });
const unchanged = (effects: Effect[] = []): Decision => ({ kind: 'unchanged', effects });
const to = (next: OrderState, effects: Effect[]): Decision => ({ kind: 'transition', next, effects });

const confirmationEffects = (orderRef: string): Effect[] => [
    { type: 'email_customer', kind: 'order_confirmation', dedupeKey: `order-confirmation:${orderRef}` },
    { type: 'email_staff_order_confirmed' },
];

function captureEffect(e: Extract<OrderEvent, { type: 'payment_captured' }>): Effect {
    return { type: 'record_capture', amount: e.amount, currency: e.currency, reference: e.reference, transactionId: e.transactionId ?? null };
}

// ── The table ───────────────────────────────────────────────────────────────

/**
 * Initial state for a new order. `orderRef` is used for email dedupe keys.
 */
export function decideCreation(event: OrderEvent, actor: Actor, orderRef: string): Decision {
    switch (event.type) {
        case 'placed_online':
            if (actor.kind !== 'customer' && actor.kind !== 'system') return notAllowed('not_permitted', 'Online orders are placed by customers');
            return to({ status: 'PENDING', payment: 'UNPAID' }, [
                { type: 'reserve_stock' },
                { type: 'claim_discount', allowOverLimit: false },
                { type: 'audit', action: 'ORDER_PLACED' },
            ]);
        case 'walk_in_sale':
            if (!isStaff(actor)) return notAllowed('not_permitted', 'Walk-in sales are recorded by staff');
            return to({ status: 'DELIVERED', payment: 'PAID' }, [
                { type: 'reserve_stock' },
                { type: 'record_capture', amount: event.amount, currency: event.currency, reference: event.reference },
                { type: 'audit', action: 'WALK_IN_SALE_RECORDED' },
            ]);
        default:
            return notAllowed('invalid_in_state', `An order can't start with "${event.type}"`);
    }
}

/**
 * The transition for an existing order. `orderRef` is the order's public reference (for dedupe keys).
 */
export function decide(state: OrderState, event: OrderEvent, actor: Actor, ctx: DecisionContext, orderRef: string): Decision {
    switch (event.type) {
        case 'placed_online':
        case 'walk_in_sale':
            return notAllowed('invalid_in_state', 'This order already exists');

        case 'payment_captured': {
            if (!isProvider(actor)) return notAllowed('not_permitted', 'Payments are reported by the payment provider');
            // Same provider reference again (IPN + redirect both arriving): nothing new happened.
            if (ctx.captureAlreadyRecorded) return unchanged();

            const verdict = assessCapturedAmount(ctx.orderTotal, roundMoney(ctx.captured + event.amount), event.currency, ctx.currency);
            const capture = captureEffect(event);

            if (awaitingPayment(state)) {
                if (verdict === 'underpaid' || verdict === 'currency_mismatch') {
                    return to({ status: 'PENDING', payment: 'HELD' }, [capture, { type: 'alert_staff', kind: 'payment_held' }, { type: 'audit', action: 'ORDER_PAYMENT_HELD' }]);
                }
                const effects: Effect[] = [capture, ...confirmationEffects(orderRef), { type: 'audit', action: 'ORDER_PAYMENT_CAPTURED' }];
                if (verdict === 'overpaid') effects.push({ type: 'alert_staff', kind: 'overpaid' });
                return to({ status: 'CONFIRMED', payment: 'PAID' }, effects);
            }

            // Late payment: the order expired (or was cancelled) before the money arrived.
            if (state.status === 'CANCELLED' && (state.payment === 'UNPAID' || state.payment === 'FAILED')) {
                if (verdict === 'underpaid' || verdict === 'currency_mismatch') {
                    return to({ status: 'CANCELLED', payment: 'HELD' }, [capture, { type: 'alert_staff', kind: 'refund_needed' }, { type: 'audit', action: 'ORDER_LATE_PAYMENT_HELD' }]);
                }
                if (ctx.stockAvailable) {
                    // Reinstatement: the discount is honoured even if the code has since hit its limit.
                    const effects: Effect[] = [
                        { type: 'reserve_stock' },
                        { type: 'claim_discount', allowOverLimit: true },
                        capture,
                        ...confirmationEffects(orderRef),
                        { type: 'audit', action: 'ORDER_REINSTATED' },
                    ];
                    if (verdict === 'overpaid') effects.push({ type: 'alert_staff', kind: 'overpaid' });
                    return to({ status: 'CONFIRMED', payment: 'PAID' }, effects);
                }
                return to({ status: 'CANCELLED', payment: 'PAID' }, [capture, { type: 'alert_staff', kind: 'refund_needed' }, { type: 'audit', action: 'ORDER_LATE_PAYMENT_REFUND_REQUIRED' }]);
            }

            // A further payment for an order that has already been paid or is held: keep the money
            // on record (it may be owed back) and let staff look at it. State doesn't move.
            return unchanged([capture, { type: 'alert_staff', kind: 'duplicate_payment' }, { type: 'audit', action: 'ORDER_EXTRA_PAYMENT_RECEIVED' }]);
        }

        case 'payment_failed': {
            if (!isProvider(actor)) return notAllowed('not_permitted', 'Payment failures are reported by the payment provider');
            // A failure only matters while the order is waiting for payment. It can never undo a payment.
            if (!awaitingPayment(state)) return unchanged();
            const email: Effect = { type: 'email_customer', kind: 'payment_failed', dedupeKey: `payment-failed:${orderRef}:${event.attemptReference}` };
            return state.payment === 'FAILED'
                ? unchanged([email])
                : to({ status: 'PENDING', payment: 'FAILED' }, [email, { type: 'audit', action: 'ORDER_PAYMENT_FAILED' }]);
        }

        case 'payment_reversed': {
            if (!isProvider(actor)) return notAllowed('not_permitted', 'Reversals are reported by the payment provider');
            if (state.payment === 'REVERSED') return unchanged();
            // Nothing was captured, so nothing can be taken back.
            if (state.payment !== 'PAID' && state.payment !== 'HELD') return unchanged();
            const amount = roundMoney(event.amount ?? Math.max(0, ctx.captured - ctx.refunded));
            return to({ status: state.status, payment: 'REVERSED' }, [
                { type: 'record_reversal', amount, reference: event.reference },
                { type: 'alert_staff', kind: 'payment_reversed' },
                { type: 'audit', action: 'ORDER_PAYMENT_REVERSED' },
                // Deliberately no customer email: a reversal is not a failed payment.
            ]);
        }

        case 'expired': {
            if (actor.kind !== 'system') return notAllowed('not_permitted', 'Only the expiry job expires orders');
            if (!awaitingPayment(state)) return unchanged();
            return to({ status: 'CANCELLED', payment: state.payment }, [
                { type: 'release_stock' },
                { type: 'release_discount' },
                // Tell the customer, so a returning shopper isn't left wondering where the order went.
                { type: 'email_customer', kind: 'order_expired', dedupeKey: `order-expired:${orderRef}` },
                { type: 'audit', action: 'ORDER_EXPIRED' },
            ]);
        }

        case 'cancelled': {
            if (state.status === 'CANCELLED') return unchanged();
            const release: Effect[] = [{ type: 'release_stock' }, { type: 'release_discount' }];

            if (awaitingPayment(state)) {
                const mayCancel = isStaffAdmin(actor) || (actor.kind === 'customer' && actor.isOwner && actor.via === 'account');
                if (!mayCancel) return notAllowed('not_permitted', 'Only the customer who placed it, or an admin, can cancel this order');
                return to({ status: 'CANCELLED', payment: state.payment }, [...release, { type: 'audit', action: 'ORDER_CANCELLED', note: event.reason }]);
            }
            if (state.payment === 'HELD') {
                if (!isStaffAdmin(actor)) return notAllowed('not_permitted', 'Only an admin can cancel an order with a held payment');
                // The held money is now a Refund owed.
                return to({ status: 'CANCELLED', payment: 'HELD' }, [...release, { type: 'audit', action: 'ORDER_CANCELLED_REFUND_OWED', note: event.reason }]);
            }
            if (state.payment === 'REVERSED') {
                if (!isStaffAdmin(actor)) return notAllowed('not_permitted', 'Only an admin can cancel a reversed order');
                return to({ status: 'CANCELLED', payment: 'REVERSED' }, [...release, { type: 'audit', action: 'ORDER_CANCELLED_AFTER_REVERSAL', note: event.reason }]);
            }
            return notAllowed('refund_instead', 'Paid orders are refunded, not cancelled — record a refund instead');
        }

        case 'marked_paid': {
            if (!isStaffAdmin(actor)) return notAllowed('not_permitted', 'Only an admin can mark an order as paid');
            if (state.payment === 'PAID') return unchanged();
            const reference = event.reference ?? `manual:${orderRef}`;
            if (state.payment === 'HELD' && state.status === 'PENDING') {
                // Accepting a held payment: the money is already on record — never invent a second capture.
                return to({ status: 'CONFIRMED', payment: 'PAID' }, [...confirmationEffects(orderRef), { type: 'audit', action: 'ORDER_HELD_PAYMENT_ACCEPTED' }]);
            }
            if (awaitingPayment(state)) {
                return to({ status: 'CONFIRMED', payment: 'PAID' }, [
                    { type: 'record_capture', amount: ctx.orderTotal, currency: ctx.currency, reference },
                    ...confirmationEffects(orderRef),
                    { type: 'audit', action: 'ORDER_MARKED_PAID' },
                ]);
            }
            if (state.payment === 'REVERSED' && state.status === 'PENDING') {
                // A held payment was reversed, then the customer paid in full some other way.
                return to({ status: 'CONFIRMED', payment: 'PAID' }, [
                    { type: 'record_capture', amount: ctx.orderTotal, currency: ctx.currency, reference },
                    ...confirmationEffects(orderRef),
                    { type: 'audit', action: 'ORDER_REPAID_AFTER_REVERSAL' },
                ]);
            }
            if (state.payment === 'REVERSED' && state.status !== 'CANCELLED') {
                // The customer paid again some other way after a reversal.
                return to({ status: state.status, payment: 'PAID' }, [
                    { type: 'record_capture', amount: ctx.orderTotal, currency: ctx.currency, reference },
                    { type: 'audit', action: 'ORDER_REPAID_AFTER_REVERSAL' },
                ]);
            }
            return notAllowed('invalid_in_state', 'This order cannot be marked as paid');
        }

        case 'dispatched': {
            // Staff press "Out for delivery" when the rider leaves; it records the dispatch time.
            if (!isStaffAdmin(actor)) return notAllowed('not_permitted', 'Only an admin can mark an order out for delivery');
            if (state.status === 'SHIPPED' || state.status === 'DELIVERED') return unchanged();
            if (state.status === 'CONFIRMED' && state.payment === 'PAID') {
                return to({ status: 'SHIPPED', payment: 'PAID' }, [{ type: 'audit', action: 'ORDER_DISPATCHED' }]);
            }
            return notAllowed('invalid_in_state', 'Only paid, confirmed orders can go out for delivery');
        }

        case 'delivered': {
            // The signed "I've received it" link in the confirmation email is itself the proof of ownership.
            const mayDeliver = isStaffAdmin(actor) || (actor.kind === 'customer' && actor.via === 'received_link');
            if (!mayDeliver) return notAllowed('not_permitted', 'Only an admin, or the customer via their email link, can mark this delivered');
            if (state.status === 'DELIVERED') return unchanged();
            if ((state.status === 'CONFIRMED' || state.status === 'SHIPPED') && state.payment === 'PAID') {
                return to({ status: 'DELIVERED', payment: 'PAID' }, [{ type: 'audit', action: 'ORDER_DELIVERED' }]);
            }
            return notAllowed('invalid_in_state', 'Only paid, confirmed orders can be marked delivered');
        }

        case 'refund_recorded': {
            if (!isStaffAdmin(actor)) return notAllowed('not_permitted', 'Only an admin can record a refund');
            if (ctx.refundAlreadyRecorded) return unchanged();
            if (state.payment === 'REVERSED') return notAllowed('invalid_in_state', 'The money was already taken back by the payment provider');
            const holdsMoney = state.payment === 'PAID' || state.payment === 'HELD';
            if (!holdsMoney) return notAllowed('invalid_in_state', 'Only orders holding money can be refunded');
            // A held payment is resolved first: accept it (then refund any overpayment) or cancel (refund owed).
            if (state.status === 'PENDING') return notAllowed('invalid_in_state', 'Accept the payment or cancel the order before refunding it');
            const refundable = roundMoney(Math.max(0, ctx.captured - ctx.refunded));
            const amount = roundMoney(event.amount);
            if (amount <= 0 || amount > refundable) {
                return notAllowed('exceeds_refundable', refundable > 0
                    ? `Only KES ${refundable.toFixed(2)} can still be refunded on this order`
                    : 'This order has already been fully refunded');
            }
            const refund: Effect = {
                type: 'record_refund', amount, method: event.method, reason: event.reason,
                externalReference: event.externalReference, idempotencyKey: event.idempotencyKey,
            };
            const fullyRefunded = roundMoney(refundable - amount) <= 0.5;
            // Cancelled orders stay cancelled; fulfilled ones become REFUNDED once nothing is left.
            if (fullyRefunded && (state.status === 'CONFIRMED' || state.status === 'SHIPPED' || state.status === 'DELIVERED')) {
                return to({ status: 'REFUNDED', payment: state.payment }, [refund, { type: 'audit', action: 'ORDER_REFUNDED' }]);
            }
            return unchanged([refund, { type: 'audit', action: 'ORDER_REFUND_RECORDED' }]);
        }

        case 'written_off': {
            if (!isStaffAdmin(actor)) return notAllowed('not_permitted', 'Only an admin can write off a reversal');
            if (state.payment !== 'REVERSED') return notAllowed('invalid_in_state', 'Only a reversed payment can be written off');
            if (!event.note.trim()) return notAllowed('invalid_in_state', 'Say why it is being written off');
            return unchanged([{ type: 'audit', action: 'ORDER_REVERSAL_WRITTEN_OFF', note: event.note.trim() }]);
        }
    }
}

// ── What an admin can do ──────────────────────────────────────────────────

export type AdminAction = 'cancel' | 'mark_paid' | 'mark_dispatched' | 'mark_delivered' | 'write_off' | 'refund';

const ADMIN_PROBE: Actor = { kind: 'staff', userId: '0', role: 'ADMIN' };
const ACTION_EVENTS: Record<AdminAction, OrderEvent> = {
    cancel: { type: 'cancelled' },
    mark_paid: { type: 'marked_paid' },
    mark_dispatched: { type: 'dispatched' },
    mark_delivered: { type: 'delivered' },
    write_off: { type: 'written_off', note: 'probe' },
    refund: { type: 'refund_recorded', amount: 0.01, method: 'probe', reason: 'probe', idempotencyKey: 'probe' },
};

/**
 * The admin actions that would do something in this state — asked of the table itself, so the
 * admin screen can never offer a button the server would refuse. `refund` means the state allows
 * refunds at all; how much is left to refund comes from the ledger.
 */
export function adminActions(state: OrderState): AdminAction[] {
    const ctx: DecisionContext = { orderTotal: 0, currency: 'KES', captured: 1, refunded: 0 };
    return (Object.keys(ACTION_EVENTS) as AdminAction[]).filter((action) => {
        const decision = decide(state, ACTION_EVENTS[action], ADMIN_PROBE, ctx, 'probe');
        return decision.kind === 'transition' || (decision.kind === 'unchanged' && decision.effects.length > 0);
    });
}

// ── What the customer sees ─────────────────────────────────────────────────

export type CustomerPaymentView =
    | { status: 'PAID' }
    | { status: 'PENDING' }
    | { status: 'FAILED' }
    | { status: 'REVIEW' }
    | { status: 'EXPIRED'; refundOwed: boolean };

/**
 * The checkout/payment screen's status, from the Order state. Pass `moneyHeld` (captured − refunded −
 * reversed) when known, so a cancelled order whose money was already refunded isn't shown as owed.
 */
export function customerView(state: OrderState, moneyHeld?: number): CustomerPaymentView {
    if (state.status === 'CANCELLED') {
        const couldHoldMoney = state.payment === 'PAID' || state.payment === 'HELD';
        return { status: 'EXPIRED', refundOwed: couldHoldMoney && (moneyHeld === undefined || moneyHeld > 0.5) };
    }
    switch (state.payment) {
        case 'PAID': return { status: 'PAID' };
        case 'HELD':
        case 'REVERSED': return { status: 'REVIEW' };
        case 'FAILED': return { status: 'FAILED' };
        case 'UNPAID': return { status: 'PENDING' };
    }
}

/** Every reachable state, for tests and for validating stored rows. */
export const ALL_STATES: OrderState[] = [
    { status: 'PENDING', payment: 'UNPAID' },
    { status: 'PENDING', payment: 'FAILED' },
    { status: 'PENDING', payment: 'HELD' },
    { status: 'PENDING', payment: 'REVERSED' },
    { status: 'CONFIRMED', payment: 'PAID' },
    { status: 'CONFIRMED', payment: 'REVERSED' },
    { status: 'SHIPPED', payment: 'PAID' },
    { status: 'SHIPPED', payment: 'REVERSED' },
    { status: 'DELIVERED', payment: 'PAID' },
    { status: 'DELIVERED', payment: 'REVERSED' },
    { status: 'REFUNDED', payment: 'PAID' },
    { status: 'REFUNDED', payment: 'REVERSED' },
    { status: 'CANCELLED', payment: 'UNPAID' },
    { status: 'CANCELLED', payment: 'FAILED' },
    { status: 'CANCELLED', payment: 'HELD' },
    { status: 'CANCELLED', payment: 'PAID' },
    { status: 'CANCELLED', payment: 'REVERSED' },
];
