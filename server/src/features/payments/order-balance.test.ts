import { describe, expect, test } from 'bun:test';
import { summariseOrderPayments, type BalanceEntry } from './order-balance';

const order = (overrides: Partial<{ total_amount: number; status: string; payment_status: string }> = {}) => ({
    total_amount: 8500,
    status: 'CONFIRMED',
    payment_status: 'PAID',
    ...overrides,
});
const capture = (amount: number): BalanceEntry => ({ entry_type: 'PAYMENT_CAPTURED', direction: 'CREDIT', amount });
const refund = (amount: number): BalanceEntry => ({ entry_type: 'REFUND_ISSUED', direction: 'DEBIT', amount });

describe('summariseOrderPayments', () => {
    test('nothing received → unpaid', () => {
        const s = summariseOrderPayments(order({ payment_status: 'UNPAID', status: 'PENDING' }), []);
        expect(s.state).toBe('unpaid');
        expect(s.refundable).toBe(0);
    });

    test('full payment → paid, all of it refundable', () => {
        const s = summariseOrderPayments(order(), [capture(8500)]);
        expect(s).toMatchObject({ captured: 8500, refunded: 0, net: 8500, refundable: 8500, state: 'paid' });
    });

    test('partial refund', () => {
        const s = summariseOrderPayments(order(), [capture(8500), refund(2000)]);
        expect(s).toMatchObject({ net: 6500, refundable: 6500, state: 'partially_refunded' });
    });

    test('several refunds adding up to the payment → refunded, nothing left', () => {
        const s = summariseOrderPayments(order({ status: 'REFUNDED' }), [capture(8500), refund(5000), refund(3500)]);
        expect(s).toMatchObject({ refunded: 8500, net: 0, refundable: 0, state: 'refunded' });
    });

    test('cancelled order still holding money → refund owed', () => {
        const s = summariseOrderPayments(order({ status: 'CANCELLED' }), [capture(8500)]);
        expect(s.state).toBe('refund_owed');
        expect(s.refundable).toBe(8500);
    });

    test('cancelled and fully refunded → refunded', () => {
        expect(summariseOrderPayments(order({ status: 'CANCELLED' }), [capture(8500), refund(8500)]).state).toBe('refunded');
    });

    test('received less than the total → underpaid', () => {
        expect(summariseOrderPayments(order(), [capture(8000)]).state).toBe('underpaid');
    });

    test('received more than the total → overpaid', () => {
        expect(summariseOrderPayments(order(), [capture(9000)]).state).toBe('overpaid');
    });

    test('sub-shilling rounding differences are still paid', () => {
        expect(summariseOrderPayments(order({ total_amount: 8500 }), [capture(8500.3)]).state).toBe('paid');
    });

    test('string amounts from the database are handled', () => {
        const s = summariseOrderPayments(order({ total_amount: '8500.00' as any }), [
            { entry_type: 'PAYMENT_CAPTURED', direction: 'CREDIT', amount: '8500.00' },
            { entry_type: 'REFUND_ISSUED', direction: 'DEBIT', amount: '1000.50' },
        ]);
        expect(s.net).toBe(7499.5);
    });

    test('paid before the ledger existed → total assumed captured and flagged', () => {
        const s = summariseOrderPayments(order(), []);
        expect(s).toMatchObject({ captured: 8500, refundable: 8500, state: 'paid', legacy_unrecorded_capture: true });
    });

    test('provider fees are tracked but do not reduce what can be refunded', () => {
        const s = summariseOrderPayments(order(), [capture(8500), { entry_type: 'PROVIDER_FEE', direction: 'DEBIT', amount: 297.5 }]);
        expect(s).toMatchObject({ net: 8500, fees: 297.5, net_after_fees: 8202.5, refundable: 8500, state: 'paid' });
    });

    test('unknown entry types are ignored', () => {
        expect(summariseOrderPayments(order(), [capture(8500), { entry_type: 'SOMETHING_ELSE', direction: 'DEBIT', amount: 99 }]).net).toBe(8500);
    });
});

import { assessCapturedAmount } from './order-balance';

describe('assessCapturedAmount', () => {
    test('exact amount → match', () => expect(assessCapturedAmount(8500, 8500, 'KES')).toBe('match'));
    test('within rounding tolerance → match', () => expect(assessCapturedAmount(8500, 8499.6, 'KES')).toBe('match'));
    test('less than total → underpaid', () => expect(assessCapturedAmount(8500, 8000, 'KES')).toBe('underpaid'));
    test('more than total → overpaid', () => expect(assessCapturedAmount(8500, 9000, 'KES')).toBe('overpaid'));
    test('different currency → currency_mismatch, even if the number matches', () =>
        expect(assessCapturedAmount(8500, 8500, 'USD')).toBe('currency_mismatch'));
    test('currency comparison ignores case', () => expect(assessCapturedAmount(8500, 8500, 'kes')).toBe('match'));
    test('unknown currency is not treated as a mismatch', () => expect(assessCapturedAmount(8500, 8500, null)).toBe('match'));
});
