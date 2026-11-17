import { describe, expect, test } from 'bun:test';
import { parseCsv } from '@server/lib/csv-import';
import {
    detectStatementColumns, normaliseStatementRows, parseMoney, reconcileStatementRows, statementColumnProblems,
    type KnownTransaction,
} from './statement';

describe('parseMoney', () => {
    test('plain number', () => expect(parseMoney('8500')).toBe(8500));
    test('currency and thousands separators', () => expect(parseMoney('KES 1,234.50')).toBe(1234.5));
    test('parentheses mean negative', () => expect(parseMoney('(150.00)')).toBe(-150));
    test('minus sign', () => expect(parseMoney('-20')).toBe(-20));
    test('blank or junk → null', () => {
        expect(parseMoney('')).toBeNull();
        expect(parseMoney('n/a')).toBeNull();
        expect(parseMoney(undefined)).toBeNull();
    });
});

describe('detectStatementColumns', () => {
    test('typical export headers', () => {
        const c = detectStatementColumns(['date', 'order_tracking_id', 'merchant_reference', 'confirmation_code', 'amount', 'commission', 'status']);
        expect(c).toMatchObject({ tracking: 'order_tracking_id', merchantReference: 'merchant_reference', confirmationCode: 'confirmation_code', amount: 'amount', fee: 'commission', status: 'status', date: 'date' });
    });
    test('amount column is not confused with fee or net amount', () => {
        const c = detectStatementColumns(['fee_amount', 'net_amount', 'gross_amount', 'reference']);
        expect(c.amount).toBe('gross_amount');
        expect(c.fee).toBe('fee_amount');
    });
    test('Paystack transactions export headers', () => {
        const c = detectStatementColumns(['reference', 'amount', 'fees', 'currency', 'channel', 'status', 'settlement_status', 'paid_at', 'customer_email']);
        expect(c).toMatchObject({ merchantReference: 'reference', amount: 'amount', fee: 'fees', status: 'status', date: 'paid_at' });
    });
    test('a settlement status is never taken for the transaction status', () => {
        expect(detectStatementColumns(['reference', 'amount', 'settlement_status', 'transaction_status']).status).toBe('transaction_status');
        expect(detectStatementColumns(['reference', 'amount', 'settlement_status']).status).toBeNull();
    });
    test('missing columns are reported in plain words', () => {
        expect(statementColumnProblems(detectStatementColumns(['date', 'description']))).toHaveLength(2);
        expect(statementColumnProblems(detectStatementColumns(['tracking_id', 'amount']))).toHaveLength(0);
    });
});

const known: KnownTransaction[] = [
    { transactionId: 1, orderId: 10, orderNumber: 'BS-AAA', references: ['TRK-1', 'MER-1', 'CONF1'], capturedAmount: 8500 },
    { transactionId: 2, orderId: 11, orderNumber: 'BS-BBB', references: ['TRK-2'], capturedAmount: 3600 },
    { transactionId: 3, orderId: 12, orderNumber: 'BS-CCC', references: ['TRK-3'], capturedAmount: 0 },
];

const statement = (csv: string) => {
    const rows = parseCsv(csv, []);
    const columns = detectStatementColumns(Object.keys(rows[0]!.values));
    return reconcileStatementRows(normaliseStatementRows(rows, columns), known);
};

describe('reconcileStatementRows', () => {
    test('matching rows produce no issues and carry the fee', () => {
        const r = statement('Tracking ID,Amount,Fee,Status\nTRK-1,"8,500.00",297.50,Completed\nTRK-2,3600,126,Completed');
        expect(r.issues).toHaveLength(0);
        expect(r.matches.map((m) => [m.transactionId, m.fee])).toEqual([[1, 297.5], [2, 126]]);
    });
    test('matches on any reference, case-insensitively', () => {
        const r = statement('Merchant Reference,Confirmation Code,Amount\n,conf1,8500');
        expect(r.matches[0]?.transactionId).toBe(1);
    });
    test('different amount → amount_mismatch', () => {
        expect(statement('Tracking ID,Amount\nTRK-2,3000').issues[0]?.kind).toBe('amount_mismatch');
    });
    test('Paystack has it, ledger does not → not_in_ledger', () => {
        const issue = statement('Tracking ID,Amount\nTRK-3,1000').issues[0];
        expect(issue?.kind).toBe('not_in_ledger');
        // Matched rows carry the order id so the admin can open the order.
        expect(issue?.order_id).not.toBeNull();
    });
    test('unknown reference', () => {
        const issue = statement('Tracking ID,Amount\nTRK-999,1000').issues[0];
        expect(issue?.kind).toBe('unknown_reference');
        expect(issue?.order_id).toBeNull();
    });
    test('failed rows are skipped, not matched', () => {
        const r = statement('Tracking ID,Amount,Status\nTRK-1,8500,Failed');
        expect(r.matches).toHaveLength(0);
        expect(r.issues[0]?.kind).toBe('not_successful');
    });
    test('a Paystack export: reference, fees, paid at', () => {
        const r = statement('Reference,Amount,Fees,Currency,Status,Paid At\nMER-1,8500.00,127.50,KES,success,2026-11-17 08:41:02');
        expect(r.issues).toHaveLength(0);
        expect(r.matches[0]).toMatchObject({ transactionId: 1, fee: 127.5 });
    });
    test('reversed rows are flagged, linking the order when it still shows the money', () => {
        const r = statement('Reference,Amount,Status\nMER-1,8500,reversed\nTRK-999,1000,Reversed');
        expect(r.matches).toHaveLength(0);
        expect(r.issues.map((i) => [i.kind, i.order_id])).toEqual([['reversed', '10'], ['reversed', null]]);
        expect(r.issues[0]?.message).toContain('still has it recorded');
    });
    test('abandoned rows are skipped', () => {
        expect(statement('Reference,Amount,Status\nMER-1,8500,abandoned').issues[0]?.kind).toBe('not_successful');
    });
    test('unreadable amount', () => {
        expect(statement('Tracking ID,Amount\nTRK-1,abc').issues[0]?.kind).toBe('unreadable_amount');
    });
});
