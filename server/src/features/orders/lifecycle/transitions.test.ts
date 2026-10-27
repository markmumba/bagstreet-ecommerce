import { describe, expect, test } from 'bun:test';
import {
    ALL_STATES, adminActions, customerView, decide, decideCreation,
    type Actor, type Decision, type DecisionContext, type Effect, type OrderEvent, type OrderState,
} from './transitions';

// ── Fixtures ────────────────────────────────────────────────────────────────

const REF = 'BS-TEST';
const provider: Actor = { kind: 'payment_provider' };
const system: Actor = { kind: 'system' };
const admin: Actor = { kind: 'staff', userId: '1', role: 'ADMIN' };
const manager: Actor = { kind: 'staff', userId: '2', role: 'MANAGER' };
const owner: Actor = { kind: 'customer', isOwner: true, via: 'account' };
const stranger: Actor = { kind: 'customer', isOwner: false, via: 'account' };
const receivedLink: Actor = { kind: 'customer', isOwner: false, via: 'received_link' };
const ACTORS = [provider, system, admin, manager, owner, stranger, receivedLink];

const ctx = (o: Partial<DecisionContext> = {}): DecisionContext => ({ orderTotal: 8500, currency: 'KES', captured: 0, refunded: 0, ...o });
const paidCtx = (o: Partial<DecisionContext> = {}) => ctx({ captured: 8500, ...o });

const ev = {
    captured: (amount = 8500, currency = 'KES', reference = 'trk-1'): OrderEvent => ({ type: 'payment_captured', amount, currency, reference }),
    failed: (attemptReference = 'trk-1'): OrderEvent => ({ type: 'payment_failed', attemptReference }),
    reversed: (): OrderEvent => ({ type: 'payment_reversed', reference: 'rev-1' }),
    expired: (): OrderEvent => ({ type: 'expired' }),
    cancelled: (): OrderEvent => ({ type: 'cancelled', reason: 'test' }),
    markedPaid: (): OrderEvent => ({ type: 'marked_paid' }),
    delivered: (): OrderEvent => ({ type: 'delivered' }),
    refund: (amount = 8500): OrderEvent => ({ type: 'refund_recorded', amount, method: 'MPESA', reason: 'returned', idempotencyKey: 'k1' }),
    writtenOff: (note = 'goods gone'): OrderEvent => ({ type: 'written_off', note }),
};

const S = (status: OrderState['status'], payment: OrderState['payment']): OrderState => ({ status, payment });
const types = (d: Decision) => (d.kind === 'not_allowed' ? [] : d.effects.map((e) => e.type));
const has = (d: Decision, type: Effect['type']) => types(d).includes(type);
const next = (d: Decision) => (d.kind === 'transition' ? d.next : null);
const alerts = (d: Decision) => (d.kind === 'not_allowed' ? [] : d.effects.filter((e): e is Extract<Effect, { type: 'alert_staff' }> => e.type === 'alert_staff').map((e) => e.kind));

// ── Creation ────────────────────────────────────────────────────────────────

describe('creation', () => {
    test('online order starts awaiting payment, reserving stock and claiming the discount', () => {
        const d = decideCreation({ type: 'placed_online' }, owner, REF);
        expect(next(d)).toEqual(S('PENDING', 'UNPAID'));
        expect(types(d)).toEqual(expect.arrayContaining(['reserve_stock', 'claim_discount']));
    });
    test('walk-in sale is born delivered and paid, with the payment recorded', () => {
        const d = decideCreation({ type: 'walk_in_sale', amount: 3600, currency: 'KES', reference: 'cash-1' }, manager, REF);
        expect(next(d)).toEqual(S('DELIVERED', 'PAID'));
        expect(types(d)).toEqual(expect.arrayContaining(['reserve_stock', 'record_capture']));
    });
    test('customers cannot record walk-in sales', () => {
        expect(decideCreation({ type: 'walk_in_sale', amount: 1, currency: 'KES', reference: 'x' }, owner, REF).kind).toBe('not_allowed');
    });
});

// ── The approved table, row by row ─────────────────────────────────────────

describe('payment captured', () => {
    test('correct amount → confirmed and paid, with confirmation and staff emails', () => {
        const d = decide(S('PENDING', 'UNPAID'), ev.captured(), provider, ctx(), REF);
        expect(next(d)).toEqual(S('CONFIRMED', 'PAID'));
        expect(types(d)).toEqual(expect.arrayContaining(['record_capture', 'email_customer', 'email_staff_order_confirmed']));
    });
    test('after an earlier failed attempt, still confirms', () => {
        expect(next(decide(S('PENDING', 'FAILED'), ev.captured(), provider, ctx(), REF))).toEqual(S('CONFIRMED', 'PAID'));
    });
    test('underpaid → held for review, money recorded, staff alerted, no confirmation email', () => {
        const d = decide(S('PENDING', 'UNPAID'), ev.captured(8000), provider, ctx(), REF);
        expect(next(d)).toEqual(S('PENDING', 'HELD'));
        expect(has(d, 'record_capture')).toBe(true);
        expect(alerts(d)).toEqual(['payment_held']);
        expect(has(d, 'email_customer')).toBe(false);
    });
    test('wrong currency → held', () => {
        expect(next(decide(S('PENDING', 'UNPAID'), ev.captured(8500, 'USD'), provider, ctx(), REF))).toEqual(S('PENDING', 'HELD'));
    });
    test('overpaid → confirmed, plus an overpaid alert', () => {
        const d = decide(S('PENDING', 'UNPAID'), ev.captured(9000), provider, ctx(), REF);
        expect(next(d)).toEqual(S('CONFIRMED', 'PAID'));
        expect(alerts(d)).toContain('overpaid');
    });
    test('same provider reference twice (IPN + redirect) → nothing happens', () => {
        const d = decide(S('CONFIRMED', 'PAID'), ev.captured(), provider, paidCtx({ captureAlreadyRecorded: true }), REF);
        expect(d).toEqual({ kind: 'unchanged', effects: [] });
    });
    test('a second, different payment on a paid order → recorded and flagged, state unchanged', () => {
        const d = decide(S('CONFIRMED', 'PAID'), ev.captured(8500, 'KES', 'trk-2'), provider, paidCtx(), REF);
        expect(d.kind).toBe('unchanged');
        expect(has(d, 'record_capture')).toBe(true);
        expect(alerts(d)).toEqual(['duplicate_payment']);
    });
    test('staff and customers cannot report payments', () => {
        expect(decide(S('PENDING', 'UNPAID'), ev.captured(), admin, ctx(), REF).kind).toBe('not_allowed');
        expect(decide(S('PENDING', 'UNPAID'), ev.captured(), owner, ctx(), REF).kind).toBe('not_allowed');
    });
});

describe('late payment (order already cancelled for non-payment)', () => {
    test('stock available → reinstated, stock re-taken, discount re-claimed even over its limit', () => {
        const d = decide(S('CANCELLED', 'UNPAID'), ev.captured(), provider, ctx({ stockAvailable: true }), REF);
        expect(next(d)).toEqual(S('CONFIRMED', 'PAID'));
        expect(d.kind !== 'not_allowed' && d.effects).toEqual(expect.arrayContaining([
            { type: 'reserve_stock' },
            { type: 'claim_discount', allowOverLimit: true },
        ]));
        expect(has(d, 'record_capture')).toBe(true);
        expect(has(d, 'email_customer')).toBe(true);
    });
    test('stock gone → stays cancelled with the money recorded as a refund owed, staff alerted', () => {
        const d = decide(S('CANCELLED', 'FAILED'), ev.captured(), provider, ctx({ stockAvailable: false }), REF);
        expect(next(d)).toEqual(S('CANCELLED', 'PAID'));
        expect(has(d, 'reserve_stock')).toBe(false);
        expect(alerts(d)).toEqual(['refund_needed']);
        expect(customerView(next(d)!)).toEqual({ status: 'EXPIRED', refundOwed: true });
    });
    test('late and underpaid → held on the cancelled order (refund owed)', () => {
        expect(next(decide(S('CANCELLED', 'UNPAID'), ev.captured(100), provider, ctx({ stockAvailable: true }), REF))).toEqual(S('CANCELLED', 'HELD'));
    });
});

describe('payment failed', () => {
    test('awaiting payment → failed, with one email per attempt', () => {
        const d = decide(S('PENDING', 'UNPAID'), ev.failed('trk-9'), provider, ctx(), REF);
        expect(next(d)).toEqual(S('PENDING', 'FAILED'));
        expect(d.kind !== 'not_allowed' && d.effects).toContainEqual({ type: 'email_customer', kind: 'payment_failed', dedupeKey: `payment-failed:${REF}:trk-9` });
    });
    test('failing again on a new attempt → still failed, new email (different dedupe key)', () => {
        const d = decide(S('PENDING', 'FAILED'), ev.failed('trk-10'), provider, ctx(), REF);
        expect(d.kind).toBe('unchanged');
        expect(has(d, 'email_customer')).toBe(true);
    });
    test('BUG FIX: a failure after the order was paid changes nothing', () => {
        for (const s of [S('CONFIRMED', 'PAID'), S('DELIVERED', 'PAID'), S('PENDING', 'HELD')]) {
            expect(decide(s, ev.failed(), provider, paidCtx(), REF)).toEqual({ kind: 'unchanged', effects: [] });
        }
    });
});

describe('payment reversed', () => {
    test('BUG FIX: paid order → flagged REVERSED (not failed), money recorded as out, staff alerted, no customer email', () => {
        const d = decide(S('CONFIRMED', 'PAID'), ev.reversed(), provider, paidCtx(), REF);
        expect(next(d)).toEqual(S('CONFIRMED', 'REVERSED'));
        expect(d.kind !== 'not_allowed' && d.effects).toContainEqual({ type: 'record_reversal', amount: 8500, reference: 'rev-1' });
        expect(alerts(d)).toEqual(['payment_reversed']);
        expect(has(d, 'email_customer')).toBe(false);
    });
    test('delivered order keeps its delivered status when reversed', () => {
        expect(next(decide(S('DELIVERED', 'PAID'), ev.reversed(), provider, paidCtx(), REF))).toEqual(S('DELIVERED', 'REVERSED'));
    });
    test('reversal amount defaults to what is still held (after partial refunds)', () => {
        const d = decide(S('CONFIRMED', 'PAID'), ev.reversed(), provider, paidCtx({ refunded: 2000 }), REF);
        expect(d.kind !== 'not_allowed' && d.effects).toContainEqual({ type: 'record_reversal', amount: 6500, reference: 'rev-1' });
    });
    test('nothing captured yet → nothing to reverse', () => {
        expect(decide(S('PENDING', 'UNPAID'), ev.reversed(), provider, ctx(), REF).kind).toBe('unchanged');
    });
    test('repeat reversal → nothing happens', () => {
        expect(decide(S('CONFIRMED', 'REVERSED'), ev.reversed(), provider, paidCtx(), REF)).toEqual({ kind: 'unchanged', effects: [] });
    });
});

describe('staff resolving a reversal', () => {
    test('cancel and restock', () => {
        const d = decide(S('DELIVERED', 'REVERSED'), ev.cancelled(), admin, paidCtx(), REF);
        expect(next(d)).toEqual(S('CANCELLED', 'REVERSED'));
        expect(has(d, 'release_stock')).toBe(true);
    });
    test('mark paid again (customer re-paid another way)', () => {
        // After a reversal the ledger nets the capture out, so nothing counts as paid any more.
        const d = decide(S('DELIVERED', 'REVERSED'), ev.markedPaid(), admin, ctx(), REF);
        expect(next(d)).toEqual(S('DELIVERED', 'PAID'));
        expect(d.kind !== 'not_allowed' && d.effects).toContainEqual(expect.objectContaining({ type: 'record_capture', amount: 8500 }));
    });
    test('write off with a note: state unchanged, audit records why', () => {
        const d = decide(S('CONFIRMED', 'REVERSED'), ev.writtenOff('bag delivered, card charged back'), admin, paidCtx(), REF);
        expect(d.kind).toBe('unchanged');
        expect(d.kind !== 'not_allowed' && d.effects).toContainEqual({ type: 'audit', action: 'ORDER_REVERSAL_WRITTEN_OFF', note: 'bag delivered, card charged back' });
    });
    test('write off needs a note', () => {
        expect(decide(S('CONFIRMED', 'REVERSED'), ev.writtenOff('  '), admin, paidCtx(), REF).kind).toBe('not_allowed');
    });
    test('a reversed order cannot be refunded — the money already went back', () => {
        expect(decide(S('CONFIRMED', 'REVERSED'), ev.refund(), admin, paidCtx(), REF).kind).toBe('not_allowed');
    });
});

describe('expiry and cancellation', () => {
    test('expired → cancelled, stock and discount released', () => {
        const d = decide(S('PENDING', 'UNPAID'), ev.expired(), system, ctx(), REF);
        expect(next(d)).toEqual(S('CANCELLED', 'UNPAID'));
        expect(types(d)).toEqual(expect.arrayContaining(['release_stock', 'release_discount']));
        expect(d.kind !== 'not_allowed' && d.effects).toContainEqual({ type: 'email_customer', kind: 'order_expired', dedupeKey: `order-expired:${REF}` });
    });
    test('expiry never touches held or reversed orders', () => {
        expect(decide(S('PENDING', 'HELD'), ev.expired(), system, ctx(), REF).kind).toBe('unchanged');
        expect(decide(S('CONFIRMED', 'REVERSED'), ev.expired(), system, ctx(), REF).kind).toBe('unchanged');
    });
    test('owner can cancel their unpaid order; a stranger cannot', () => {
        expect(next(decide(S('PENDING', 'UNPAID'), ev.cancelled(), owner, ctx(), REF))).toEqual(S('CANCELLED', 'UNPAID'));
        expect(decide(S('PENDING', 'UNPAID'), ev.cancelled(), stranger, ctx(), REF).kind).toBe('not_allowed');
    });
    test('admin cancels a held order → cancelled with a refund owed', () => {
        const d = decide(S('PENDING', 'HELD'), ev.cancelled(), admin, ctx({ captured: 8000 }), REF);
        expect(next(d)).toEqual(S('CANCELLED', 'HELD'));
        expect(customerView(next(d)!)).toEqual({ status: 'EXPIRED', refundOwed: true });
    });
    test('customer cannot cancel a held order', () => {
        expect(decide(S('PENDING', 'HELD'), ev.cancelled(), owner, ctx(), REF).kind).toBe('not_allowed');
    });
    test('paid order cannot be cancelled — refund instead', () => {
        const d = decide(S('CONFIRMED', 'PAID'), ev.cancelled(), admin, paidCtx(), REF);
        expect(d).toMatchObject({ kind: 'not_allowed', reason: 'refund_instead' });
    });
    test('cancelling twice → nothing happens', () => {
        expect(decide(S('CANCELLED', 'UNPAID'), ev.cancelled(), admin, ctx(), REF)).toEqual({ kind: 'unchanged', effects: [] });
    });
});

describe('marked paid by staff', () => {
    test('accepting a held payment never invents a second capture', () => {
        const d = decide(S('PENDING', 'HELD'), ev.markedPaid(), admin, ctx({ captured: 8000 }), REF);
        expect(next(d)).toEqual(S('CONFIRMED', 'PAID'));
        expect(has(d, 'record_capture')).toBe(false);
        expect(has(d, 'email_customer')).toBe(true);
    });
    test('unpaid order marked paid records the full total', () => {
        const d = decide(S('PENDING', 'UNPAID'), ev.markedPaid(), admin, ctx(), REF);
        expect(d.kind !== 'not_allowed' && d.effects).toContainEqual({ type: 'record_capture', amount: 8500, currency: 'KES', reference: `manual:${REF}` });
    });
    test('managers cannot mark orders paid', () => {
        expect(decide(S('PENDING', 'UNPAID'), ev.markedPaid(), manager, ctx(), REF).kind).toBe('not_allowed');
    });
});

describe('delivered', () => {
    test('admin, or the customer via the email link, can mark a paid order delivered', () => {
        expect(next(decide(S('CONFIRMED', 'PAID'), ev.delivered(), admin, paidCtx(), REF))).toEqual(S('DELIVERED', 'PAID'));
        expect(next(decide(S('CONFIRMED', 'PAID'), ev.delivered(), receivedLink, paidCtx(), REF))).toEqual(S('DELIVERED', 'PAID'));
    });
    test('not before payment, and not by a manager or from the account page', () => {
        expect(decide(S('PENDING', 'UNPAID'), ev.delivered(), admin, ctx(), REF).kind).toBe('not_allowed');
        expect(decide(S('CONFIRMED', 'PAID'), ev.delivered(), manager, paidCtx(), REF).kind).toBe('not_allowed');
        expect(decide(S('CONFIRMED', 'PAID'), ev.delivered(), owner, paidCtx(), REF).kind).toBe('not_allowed');
    });
});

describe('out for delivery', () => {
    test('an admin marks a paid order out for delivery; then it can be received', () => {
        const out = decide(S('CONFIRMED', 'PAID'), { type: 'dispatched' }, admin, paidCtx(), REF);
        expect(next(out)).toEqual(S('SHIPPED', 'PAID'));
        expect(next(decide(S('SHIPPED', 'PAID'), ev.delivered(), receivedLink, paidCtx(), REF))).toEqual(S('DELIVERED', 'PAID'));
    });
    test('not before payment, not by a manager, and pressing it twice changes nothing', () => {
        expect(decide(S('PENDING', 'UNPAID'), { type: 'dispatched' }, admin, ctx(), REF).kind).toBe('not_allowed');
        expect(decide(S('CONFIRMED', 'PAID'), { type: 'dispatched' }, manager, paidCtx(), REF).kind).toBe('not_allowed');
        expect(decide(S('SHIPPED', 'PAID'), { type: 'dispatched' }, admin, paidCtx(), REF)).toEqual({ kind: 'unchanged', effects: [] });
    });
    test('a paid order on its way is refunded, not cancelled; a reversal keeps it on its way', () => {
        expect(decide(S('SHIPPED', 'PAID'), ev.cancelled(), admin, paidCtx(), REF)).toMatchObject({ kind: 'not_allowed', reason: 'refund_instead' });
        expect(next(decide(S('SHIPPED', 'PAID'), ev.reversed(), provider, paidCtx(), REF))).toEqual(S('SHIPPED', 'REVERSED'));
        expect(next(decide(S('SHIPPED', 'PAID'), ev.refund(8500), admin, paidCtx(), REF))).toEqual(S('REFUNDED', 'PAID'));
    });
});

describe('refunds', () => {
    test('partial refund keeps the status', () => {
        const d = decide(S('DELIVERED', 'PAID'), ev.refund(2000), admin, paidCtx(), REF);
        expect(d.kind).toBe('unchanged');
        expect(has(d, 'record_refund')).toBe(true);
    });
    test('refunding the rest → REFUNDED', () => {
        expect(next(decide(S('DELIVERED', 'PAID'), ev.refund(6500), admin, paidCtx({ refunded: 2000 }), REF))).toEqual(S('REFUNDED', 'PAID'));
    });
    test('more than what is left → not allowed, with the amount in the message', () => {
        const d = decide(S('CONFIRMED', 'PAID'), ev.refund(7000), admin, paidCtx({ refunded: 2000 }), REF);
        expect(d).toMatchObject({ kind: 'not_allowed', reason: 'exceeds_refundable' });
        expect(d.kind === 'not_allowed' && d.message).toContain('6500.00');
    });
    test('a held payment is accepted or cancelled before any refund', () => {
        expect(decide(S('PENDING', 'HELD'), ev.refund(100), admin, ctx({ captured: 8000 }), REF)).toMatchObject({ kind: 'not_allowed', reason: 'invalid_in_state' });
    });
    test('the same refund submitted twice is recorded once', () => {
        expect(decide(S('CONFIRMED', 'PAID'), ev.refund(100), admin, paidCtx({ refundAlreadyRecorded: true }), REF)).toEqual({ kind: 'unchanged', effects: [] });
    });
    test('managers cannot record refunds', () => {
        expect(decide(S('CONFIRMED', 'PAID'), ev.refund(100), manager, paidCtx(), REF).kind).toBe('not_allowed');
    });
    test('refund owed on a cancelled order settles but the order stays cancelled', () => {
        const d = decide(S('CANCELLED', 'PAID'), ev.refund(8500), admin, paidCtx(), REF);
        expect(d.kind).toBe('unchanged');
        expect(has(d, 'record_refund')).toBe(true);
    });
});

// ── Gift vouchers (CONTEXT.md › Gift vouchers) ─────────────────────────────

describe('gift vouchers', () => {
    // An 8,500 order where a voucher pays 3,000: the hold counts as money towards the order.
    const held = (o: Partial<DecisionContext> = {}) => ctx({ captured: 3000, voucherHeld: 3000, ...o });
    const spent = (o: Partial<DecisionContext> = {}) => ctx({ captured: 8500, voucherRedeemed: 3000, ...o });
    const voucherRefund = (amount: number): OrderEvent => ({ type: 'refund_recorded', amount, method: 'GIFT_VOUCHER', reason: 'returned', idempotencyKey: 'v1' });
    const capture = (d: Decision) => (d.kind === 'not_allowed' ? undefined : d.effects.find((e): e is Extract<Effect, { type: 'record_capture' }> => e.type === 'record_capture'));

    test('an online order the voucher fully covers is paid at once, without the payment provider', () => {
        const d = decideCreation({ type: 'placed_online', paidByVoucher: true }, owner, REF);
        expect(next(d)).toEqual(S('CONFIRMED', 'PAID'));
        expect(types(d)).toEqual(expect.arrayContaining(['reserve_stock', 'claim_discount', 'hold_voucher', 'redeem_voucher', 'email_customer', 'email_staff_order_confirmed']));
        expect(has(d, 'record_capture')).toBe(false);
    });
    test('a voucher covering part of an online order is held while the rest is paid', () => {
        const d = decideCreation({ type: 'placed_online' }, owner, REF);
        expect(next(d)).toEqual(S('PENDING', 'UNPAID'));
        expect(has(d, 'hold_voucher')).toBe(true);
        expect(has(d, 'redeem_voucher')).toBe(false);
    });
    test('a walk-in sale paid entirely by voucher records no counter payment', () => {
        const d = decideCreation({ type: 'walk_in_sale', amount: 0, currency: 'KES', reference: 'cash-1' }, manager, REF);
        expect(next(d)).toEqual(S('DELIVERED', 'PAID'));
        expect(types(d)).toEqual(expect.arrayContaining(['hold_voucher', 'redeem_voucher']));
        expect(has(d, 'record_capture')).toBe(false);
    });
    test('a walk-in sale part paid by voucher records the cash part', () => {
        const d = decideCreation({ type: 'walk_in_sale', amount: 1500, currency: 'KES', reference: 'cash-1' }, manager, REF);
        expect(capture(d)?.amount).toBe(1500);
        expect(has(d, 'redeem_voucher')).toBe(true);
    });
    test('paying the rest confirms the order and spends the voucher', () => {
        const d = decide(S('PENDING', 'UNPAID'), ev.captured(5500), provider, held(), REF);
        expect(next(d)).toEqual(S('CONFIRMED', 'PAID'));
        expect(has(d, 'redeem_voucher')).toBe(true);
        expect(alerts(d)).not.toContain('overpaid');
    });
    test('paying less than the rest holds the payment and keeps the voucher on hold', () => {
        const d = decide(S('PENDING', 'UNPAID'), ev.captured(5000), provider, held(), REF);
        expect(next(d)).toEqual(S('PENDING', 'HELD'));
        expect(has(d, 'redeem_voucher')).toBe(false);
    });
    test('expiry and cancellation give the held voucher money back', () => {
        expect(has(decide(S('PENDING', 'UNPAID'), ev.expired(), system, held(), REF), 'release_voucher')).toBe(true);
        expect(has(decide(S('PENDING', 'UNPAID'), ev.cancelled(), owner, held(), REF), 'release_voucher')).toBe(true);
        expect(has(decide(S('PENDING', 'HELD'), ev.cancelled(), admin, held({ captured: 8000 }), REF), 'release_voucher')).toBe(true);
    });
    test('a late payment reinstates the order when the voucher can still pay its part', () => {
        const d = decide(S('CANCELLED', 'UNPAID'), ev.captured(5500), provider, ctx({ stockAvailable: true, voucherReclaimable: 3000 }), REF);
        expect(next(d)).toEqual(S('CONFIRMED', 'PAID'));
        expect(types(d)).toEqual(expect.arrayContaining(['reserve_stock', 'claim_discount', 'hold_voucher', 'redeem_voucher']));
    });
    test('a late payment when the voucher was spent elsewhere is held as a refund owed', () => {
        const d = decide(S('CANCELLED', 'UNPAID'), ev.captured(5500), provider, ctx({ stockAvailable: true, voucherReclaimable: 0 }), REF);
        expect(next(d)).toEqual(S('CANCELLED', 'HELD'));
        expect(alerts(d)).toContain('refund_needed');
        expect(has(d, 'hold_voucher')).toBe(false);
    });
    test('marking a voucher order paid records only what the voucher does not cover', () => {
        const d = decide(S('PENDING', 'UNPAID'), ev.markedPaid(), admin, held(), REF);
        expect(next(d)).toEqual(S('CONFIRMED', 'PAID'));
        expect(capture(d)?.amount).toBe(5500);
        expect(has(d, 'redeem_voucher')).toBe(true);
    });
    test('accepting a held payment spends the voucher', () => {
        expect(has(decide(S('PENDING', 'HELD'), ev.markedPaid(), admin, held({ captured: 8000 }), REF), 'redeem_voucher')).toBe(true);
    });
    test('a refund back onto the voucher gives the money back to it', () => {
        const d = decide(S('DELIVERED', 'PAID'), voucherRefund(3000), admin, spent(), REF);
        expect(d.kind).toBe('unchanged');
        expect(d.kind !== 'not_allowed' && d.effects).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'record_refund', amount: 3000, method: 'GIFT_VOUCHER' }),
            { type: 'return_to_voucher', amount: 3000 },
        ]));
    });
    test('no more goes back onto the voucher than it paid', () => {
        const d = decide(S('DELIVERED', 'PAID'), voucherRefund(3500), admin, spent(), REF);
        expect(d).toMatchObject({ kind: 'not_allowed', reason: 'exceeds_refundable' });
        expect(d.kind === 'not_allowed' && d.message).toContain('3000.00');
    });
    test('vouchers are never paid out as cash: a cash refund is limited to the cash part', () => {
        const d = decide(S('DELIVERED', 'PAID'), ev.refund(6000), admin, spent(), REF);
        expect(d).toMatchObject({ kind: 'not_allowed', reason: 'exceeds_refundable' });
        expect(d.kind === 'not_allowed' && d.message).toContain('5500.00');
        expect(d.kind === 'not_allowed' && d.message).toContain('gift voucher');
    });
    test('refunding the cash part and the voucher part → REFUNDED', () => {
        const afterCash = spent({ refunded: 5500 });
        expect(next(decide(S('DELIVERED', 'PAID'), voucherRefund(3000), admin, afterCash, REF))).toEqual(S('REFUNDED', 'PAID'));
    });
    test('a reversal only takes back money the payment provider received', () => {
        const d = decide(S('CONFIRMED', 'PAID'), ev.reversed(), provider, spent(), REF);
        const reversal = d.kind !== 'not_allowed' ? d.effects.find((e) => e.type === 'record_reversal') : undefined;
        expect(reversal).toMatchObject({ amount: 5500 });
    });
});

// ── Gift vouchers bought online (order source GIFT_VOUCHER) ────────────────

describe('gift voucher sales', () => {
    const sale = (o: Partial<DecisionContext> = {}, voucher = { issued: false, untouched: true }) => ctx({ giftVoucher: voucher, ...o });
    const issued = (untouched = true, o: Partial<DecisionContext> = {}) => sale({ captured: 8500, ...o }, { issued: true, untouched });

    test('paying issues the voucher and the sale is done: no confirmation email, nothing to dispatch', () => {
        const d = decide(S('PENDING', 'UNPAID'), ev.captured(), provider, sale(), REF);
        expect(next(d)).toEqual(S('DELIVERED', 'PAID'));
        expect(has(d, 'issue_gift_voucher')).toBe(true);
        expect(has(d, 'email_customer')).toBe(false);
        expect(has(d, 'email_staff_order_confirmed')).toBe(false);
    });
    test('an underpaid voucher purchase is held; no voucher until staff accept it', () => {
        const held = decide(S('PENDING', 'UNPAID'), ev.captured(8000), provider, sale(), REF);
        expect(next(held)).toEqual(S('PENDING', 'HELD'));
        expect(has(held, 'issue_gift_voucher')).toBe(false);
        const accepted = decide(S('PENDING', 'HELD'), ev.markedPaid(), admin, sale({ captured: 8000 }), REF);
        expect(next(accepted)).toEqual(S('DELIVERED', 'PAID'));
        expect(has(accepted, 'issue_gift_voucher')).toBe(true);
    });
    test('a payment after the purchase expired still issues the voucher', () => {
        const d = decide(S('CANCELLED', 'UNPAID'), ev.captured(), provider, sale({ stockAvailable: true }), REF);
        expect(next(d)).toEqual(S('DELIVERED', 'PAID'));
        expect(has(d, 'issue_gift_voucher')).toBe(true);
    });
    test('marking a voucher purchase paid issues the voucher', () => {
        const d = decide(S('PENDING', 'UNPAID'), ev.markedPaid(), admin, sale(), REF);
        expect(next(d)).toEqual(S('DELIVERED', 'PAID'));
        expect(has(d, 'issue_gift_voucher')).toBe(true);
    });
    test('a reversal cancels whatever is left on the voucher and alerts staff', () => {
        const d = decide(S('DELIVERED', 'PAID'), ev.reversed(), provider, issued(false), REF);
        expect(next(d)).toEqual(S('DELIVERED', 'REVERSED'));
        expect(d.kind !== 'not_allowed' && d.effects).toContainEqual({ type: 'cancel_gift_voucher', reason: 'payment_reversed' });
        expect(alerts(d)).toContain('payment_reversed');
    });
    test('an untouched voucher can be refunded in full, which cancels it', () => {
        const d = decide(S('DELIVERED', 'PAID'), ev.refund(8500), admin, issued(true), REF);
        expect(next(d)).toEqual(S('REFUNDED', 'PAID'));
        expect(d.kind !== 'not_allowed' && d.effects).toContainEqual({ type: 'cancel_gift_voucher', reason: 'refunded' });
    });
    test('no partial refunds of a voucher purchase', () => {
        const d = decide(S('DELIVERED', 'PAID'), ev.refund(2000), admin, issued(true), REF);
        expect(d).toMatchObject({ kind: 'not_allowed', reason: 'exceeds_refundable' });
    });
    test('once any of the voucher is spent or held, the purchase can not be refunded', () => {
        expect(decide(S('DELIVERED', 'PAID'), ev.refund(8500), admin, issued(false), REF)).toMatchObject({ kind: 'not_allowed', reason: 'invalid_in_state' });
    });
    test('repaying after a reversal is refused: a new voucher is issued instead', () => {
        expect(decide(S('DELIVERED', 'REVERSED'), ev.markedPaid(), admin, issued(false, { captured: 0 }), REF)).toMatchObject({ kind: 'not_allowed' });
    });
    test('out for delivery and received change nothing on a voucher sale', () => {
        expect(decide(S('DELIVERED', 'PAID'), { type: 'dispatched' }, admin, issued(), REF).kind).toBe('unchanged');
        expect(decide(S('DELIVERED', 'PAID'), ev.delivered(), admin, issued(), REF).kind).toBe('unchanged');
    });
});

describe('customer view', () => {
    test.each([
        [S('PENDING', 'UNPAID'), { status: 'PENDING' }],
        [S('PENDING', 'FAILED'), { status: 'FAILED' }],
        [S('PENDING', 'HELD'), { status: 'REVIEW' }],
        [S('CONFIRMED', 'REVERSED'), { status: 'REVIEW' }],
        [S('CONFIRMED', 'PAID'), { status: 'PAID' }],
        [S('DELIVERED', 'PAID'), { status: 'PAID' }],
        [S('CANCELLED', 'UNPAID'), { status: 'EXPIRED', refundOwed: false }],
        [S('CANCELLED', 'PAID'), { status: 'EXPIRED', refundOwed: true }],
    ])('%o → %o', (state, view) => {
        expect(customerView(state)).toEqual(view as ReturnType<typeof customerView>);
    });
    test('a cancelled order whose money was refunded is no longer shown as owed', () => {
        expect(customerView(S('CANCELLED', 'PAID'), 0)).toEqual({ status: 'EXPIRED', refundOwed: false });
        expect(customerView(S('CANCELLED', 'HELD'), 8000)).toEqual({ status: 'EXPIRED', refundOwed: true });
    });
});

describe('admin actions offered', () => {
    test.each([
        [S('PENDING', 'UNPAID'), ['cancel', 'mark_paid']],
        [S('PENDING', 'FAILED'), ['cancel', 'mark_paid']],
        [S('PENDING', 'HELD'), ['cancel', 'mark_paid']],
        [S('CONFIRMED', 'PAID'), ['mark_dispatched', 'mark_delivered', 'refund']],
        [S('SHIPPED', 'PAID'), ['mark_delivered', 'refund']],
        [S('DELIVERED', 'PAID'), ['refund']],
        [S('CONFIRMED', 'REVERSED'), ['cancel', 'mark_paid', 'write_off']],
        [S('CANCELLED', 'UNPAID'), []],
        [S('CANCELLED', 'PAID'), ['refund']],
        [S('CANCELLED', 'HELD'), ['refund']],
        [S('REFUNDED', 'PAID'), ['refund']],
    ])('%o → %o', (state, actions) => {
        expect(adminActions(state)).toEqual(actions as ReturnType<typeof adminActions>);
    });
});

// ── Exhaustive invariants: every state × every event × every actor ─────────

const EVENTS: OrderEvent[] = [
    ev.captured(), ev.captured(8000), ev.captured(9000), ev.captured(8500, 'USD'),
    ev.failed(), ev.reversed(), ev.expired(), ev.cancelled(), ev.markedPaid(),
    { type: 'dispatched' }, ev.delivered(), ev.refund(100), ev.refund(8500), ev.writtenOff(),
    { type: 'placed_online' }, { type: 'walk_in_sale', amount: 1, currency: 'KES', reference: 'x' },
    { type: 'refund_recorded', amount: 3000, method: 'GIFT_VOUCHER', reason: 'r', idempotencyKey: 'v' },
];
const CONTEXTS = [
    ctx(), paidCtx(), ctx({ stockAvailable: true }), ctx({ stockAvailable: false }), paidCtx({ refunded: 8500 }),
    // Gift voucher orders: part held, part spent, and a cancelled one whose voucher can pay again.
    ctx({ captured: 3000, voucherHeld: 3000 }), paidCtx({ voucherRedeemed: 3000 }),
    ctx({ stockAvailable: true, voucherReclaimable: 3000 }),
    // Gift voucher purchases: before and after the voucher is issued.
    ctx({ stockAvailable: true, giftVoucher: { issued: false, untouched: true } }),
    paidCtx({ giftVoucher: { issued: true, untouched: true } }), paidCtx({ giftVoucher: { issued: true, untouched: false } }),
];
const key = (s: OrderState) => `${s.status}/${s.payment}`;
const VALID = new Set(ALL_STATES.map(key));

type Case = { state: OrderState; event: OrderEvent; actor: Actor; context: DecisionContext; d: Decision };
const cases: Case[] = [];
for (const state of ALL_STATES) for (const event of EVENTS) for (const actor of ACTORS) for (const context of CONTEXTS) {
    cases.push({ state, event, actor, context, d: decide(state, event, actor, context, REF) });
}
const describeCase = (c: Case) => `${key(c.state)} + ${c.event.type} by ${c.actor.kind}${c.actor.kind === 'staff' ? `:${c.actor.role}` : ''}`;

describe(`invariants over ${ALL_STATES.length} states × ${EVENTS.length} events × ${ACTORS.length} actors × ${CONTEXTS.length} contexts`, () => {
    test('the table never produces a state outside the reachable set', () => {
        const bad = cases.filter((c) => c.d.kind === 'transition' && !VALID.has(key(c.d.next))).map(describeCase);
        expect(bad).toEqual([]);
    });

    test('BUG CLASS: nothing ever moves a paid order back to failed or unpaid', () => {
        const bad = cases.filter((c) => c.state.payment === 'PAID' && c.d.kind === 'transition'
            && (c.d.next.payment === 'FAILED' || c.d.next.payment === 'UNPAID')).map(describeCase);
        expect(bad).toEqual([]);
    });

    test('an order only becomes paid with a recorded payment, its gift voucher, or by staff accepting a held one', () => {
        const bad = cases.filter((c) => c.d.kind === 'transition' && c.d.next.payment === 'PAID' && c.state.payment !== 'PAID'
            && !has(c.d, 'record_capture') && !(c.context.captured >= c.context.orderTotal && has(c.d, 'redeem_voucher'))
            && !(c.state.payment === 'HELD' && c.event.type === 'marked_paid')).map(describeCase);
        expect(bad).toEqual([]);
    });

    test('an order that goes ahead once paid always spends its gift voucher hold', () => {
        // (A Late payment on a cancelled order that can't be revived is money owed back, not a sale.)
        const bad = cases.filter((c) => c.d.kind === 'transition' && c.d.next.payment === 'PAID' && c.state.payment !== 'PAID'
            && c.d.next.status !== 'CANCELLED' && !has(c.d, 'redeem_voucher')).map(describeCase);
        expect(bad).toEqual([]);
    });

    test('entering CANCELLED always releases stock, discount use and the gift voucher', () => {
        const bad = cases.filter((c) => c.d.kind === 'transition' && c.d.next.status === 'CANCELLED' && c.state.status !== 'CANCELLED'
            && !(has(c.d, 'release_stock') && has(c.d, 'release_discount') && has(c.d, 'release_voucher'))).map(describeCase);
        expect(bad).toEqual([]);
    });

    test('BUG CLASS: leaving CANCELLED always re-takes stock, re-claims the discount and re-holds the voucher', () => {
        const bad = cases.filter((c) => c.d.kind === 'transition' && c.state.status === 'CANCELLED' && c.d.next.status !== 'CANCELLED'
            && !(has(c.d, 'reserve_stock') && has(c.d, 'claim_discount') && has(c.d, 'hold_voucher'))).map(describeCase);
        expect(bad).toEqual([]);
    });

    test('vouchers are never paid out as cash: refunds beyond the cash part only go back onto the voucher', () => {
        const bad = cases.filter((c) => c.event.type === 'refund_recorded' && c.event.method !== 'GIFT_VOUCHER' && c.d.kind !== 'not_allowed'
            && has(c.d, 'record_refund') && c.event.amount > c.context.captured - c.context.refunded
                - (c.context.voucherHeld ?? 0) - ((c.context.voucherRedeemed ?? 0) - (c.context.voucherReturned ?? 0)) + 0.005).map(describeCase);
        expect(bad).toEqual([]);
    });

    test('a reversal never emails the customer', () => {
        const bad = cases.filter((c) => c.event.type === 'payment_reversed' && has(c.d, 'email_customer')).map(describeCase);
        expect(bad).toEqual([]);
    });

    test('customers can only place, cancel their own unpaid order, or confirm receipt', () => {
        const allowedForCustomers = new Set(['placed_online', 'cancelled', 'delivered']);
        const bad = cases.filter((c) => c.actor.kind === 'customer' && c.d.kind !== 'not_allowed' && !allowedForCustomers.has(c.event.type)
            && !(c.d.kind === 'unchanged' && c.d.effects.length === 0)).map(describeCase);
        expect(bad).toEqual([]);
    });

    test('managers cannot change an existing order', () => {
        const bad = cases.filter((c) => c.actor.kind === 'staff' && c.actor.role === 'MANAGER'
            && (c.d.kind === 'transition' || (c.d.kind === 'unchanged' && c.d.effects.length > 0))).map(describeCase);
        expect(bad).toEqual([]);
    });

    test('every refusal explains itself', () => {
        const bad = cases.filter((c) => c.d.kind === 'not_allowed' && !c.d.message.trim()).map(describeCase);
        expect(bad).toEqual([]);
    });

    test('every state change is audited', () => {
        const bad = cases.filter((c) => c.d.kind === 'transition' && !has(c.d, 'audit')).map(describeCase);
        expect(bad).toEqual([]);
    });
});
