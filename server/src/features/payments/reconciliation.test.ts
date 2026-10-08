import { describe, expect, test } from 'bun:test';
import { classifyOrderForReconciliation, type ReconciliationOrderRow } from './reconciliation';

const row = (o: Partial<ReconciliationOrderRow> = {}): ReconciliationOrderRow => ({
    order_id: 1, order_number: 'BS-1', total_amount: 8500, status: 'CONFIRMED', payment_status: 'PAID',
    order_source: 'ONLINE', captured: 8500, refunded: 0, reversed: 0, reversal_written_off: false,
    has_completed_provider_payment: true, ...o,
});
const kinds = (o: Partial<ReconciliationOrderRow>) => classifyOrderForReconciliation(row(o)).map((i) => i.kind);

describe('classifyOrderForReconciliation', () => {
    test('a normal paid online order has no issues', () => expect(kinds({})).toEqual([]));
    test('walk-in sale paid at the counter has no issues', () =>
        expect(kinds({ order_source: 'WALK_IN', has_completed_provider_payment: false })).toEqual([]));
    test('paid with nothing in the ledger', () =>
        expect(kinds({ captured: 0 })).toContain('paid_without_capture'));
    test('Pesapal completed but ledger empty', () =>
        expect(kinds({ payment_status: 'UNPAID', status: 'PENDING', captured: 0 })).toEqual(['completed_payment_without_capture']));
    test('money held for review', () =>
        expect(kinds({ payment_status: 'UNPAID', status: 'PENDING', captured: 8000 })).toEqual(['held_for_review']));
    test('overpaid accepted order', () => {
        const [issue] = classifyOrderForReconciliation(row({ captured: 9000 }));
        expect(issue?.kind).toBe('amount_mismatch');
        expect(issue?.message).toContain('Overpaid by KES 500.00');
    });
    test('cancelled order still holding money', () =>
        expect(kinds({ status: 'CANCELLED', captured: 8500 })).toEqual(['refund_owed']));
    test('cancelled and refunded is fine', () =>
        expect(kinds({ status: 'CANCELLED', captured: 8500, refunded: 8500 })).toEqual([]));
    test('online order marked paid by hand', () =>
        expect(kinds({ has_completed_provider_payment: false })).toEqual(['marked_paid_manually']));
    test('partially refunded paid order is fine', () => expect(kinds({ refunded: 2000 })).toEqual([]));
    test('reversed payment waiting for staff', () =>
        expect(kinds({ payment_status: 'REVERSED', reversed: 8500 })).toEqual(['payment_reversed']));
    test('written-off or cancelled reversals are settled', () => {
        expect(kinds({ payment_status: 'REVERSED', reversed: 8500, reversal_written_off: true })).toEqual([]);
        expect(kinds({ payment_status: 'REVERSED', status: 'CANCELLED', reversed: 8500 })).toEqual([]);
    });
    test('reversed, then paid again another way: not overpaid', () =>
        expect(kinds({ captured: 17000, reversed: 8500, has_completed_provider_payment: true })).toEqual([]));
});
