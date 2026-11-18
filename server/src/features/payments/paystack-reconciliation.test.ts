import { describe, expect, test } from 'bun:test';
import {
    nairobiDayWindow,
    nairobiHour,
    previousNairobiDay,
    reconcileWithPaystack,
    type OurAttempt,
    type ProviderTransaction,
} from './paystack-reconciliation';

const attempt = (over: Partial<OurAttempt> = {}): OurAttempt => ({
    transactionId: 1, orderId: 10, orderNumber: 'BS-10', reference: 'BS-10-abc',
    status: 'COMPLETED', captured: 1500, currency: 'KES', inWindow: true, ...over,
});
const paystack = (over: Partial<ProviderTransaction> = {}): ProviderTransaction => ({
    reference: 'BS-10-abc', status: 'success', amount: 1500, currency: 'KES', ...over,
});

describe('reconcileWithPaystack', () => {
    test('a payment both sides agree on produces nothing', () => {
        expect(reconcileWithPaystack([paystack()], [attempt()])).toEqual({ actions: [], issues: [] });
    });

    test('Paystack success with no capture here is recorded, whatever our attempt says', () => {
        for (const status of ['PENDING', 'FAILED', 'COMPLETED']) {
            const { actions, issues } = reconcileWithPaystack([paystack()], [attempt({ status, captured: 0 })]);
            expect(issues).toEqual([]);
            expect(actions.map((a) => a.kind)).toEqual(['record_missed_payment']);
        }
    });

    test('references match without regard to case', () => {
        const { actions } = reconcileWithPaystack([paystack({ reference: 'bs-10-ABC' })], [attempt({ captured: 0 })]);
        expect(actions).toHaveLength(1);
    });

    test('a different amount or currency is flagged, not changed', () => {
        const amount = reconcileWithPaystack([paystack({ amount: 1000 })], [attempt()]);
        expect(amount.actions).toEqual([]);
        expect(amount.issues.map((i) => i.kind)).toEqual(['amount_mismatch']);
        expect(amount.issues[0]).toMatchObject({ paystackAmount: 1000, ourAmount: 1500, orderId: 10 });

        const currency = reconcileWithPaystack([paystack({ currency: 'NGN' })], [attempt()]);
        expect(currency.issues.map((i) => i.kind)).toEqual(['amount_mismatch']);

        expect(reconcileWithPaystack([paystack({ amount: 1500.4 })], [attempt()]).issues).toEqual([]);
    });

    test('money received under a reference we never issued is flagged; other statuses are ignored', () => {
        const { issues } = reconcileWithPaystack(
            [paystack({ reference: 'LINK-1' }), paystack({ reference: 'LINK-2', status: 'failed' })],
            [],
        );
        expect(issues.map((i) => [i.kind, i.reference])).toEqual([['unknown_reference', 'LINK-1']]);
    });

    test('a capture here that Paystack failed or reversed is flagged', () => {
        for (const status of ['failed', 'abandoned', 'reversed']) {
            const { actions, issues } = reconcileWithPaystack([paystack({ status })], [attempt()]);
            expect(actions).toEqual([]);
            expect(issues.map((i) => i.kind)).toEqual(['not_successful_at_paystack']);
        }
    });

    test('a pending attempt Paystack has settled unpaid is refreshed, not alerted', () => {
        const { actions, issues } = reconcileWithPaystack([paystack({ status: 'abandoned' })], [attempt({ status: 'PENDING', captured: 0 })]);
        expect(issues).toEqual([]);
        expect(actions.map((a) => a.kind)).toEqual(['settle_stale_pending']);
    });

    test('an already-failed attempt Paystack also failed produces nothing', () => {
        expect(reconcileWithPaystack([paystack({ status: 'failed' })], [attempt({ status: 'FAILED', captured: 0 })]))
            .toEqual({ actions: [], issues: [] });
    });

    test('still pending at Paystack: nothing to say yet', () => {
        expect(reconcileWithPaystack([paystack({ status: 'ongoing' })], [attempt({ status: 'PENDING', captured: 0 })]))
            .toEqual({ actions: [], issues: [] });
    });

    test('a capture Paystack has no record of is flagged, only for the day itself and never for mocks', () => {
        expect(reconcileWithPaystack([], [attempt()]).issues.map((i) => i.kind)).toEqual(['missing_at_paystack']);
        expect(reconcileWithPaystack([], [attempt({ inWindow: false })]).issues).toEqual([]);
        expect(reconcileWithPaystack([], [attempt({ captured: 0 })]).issues).toEqual([]);
        expect(reconcileWithPaystack([], [attempt({ reference: 'mock-paystack-BS-10-abc' })]).issues).toEqual([]);
    });
});

describe('Nairobi day helpers', () => {
    test('a day runs from Nairobi midnight to midnight, with slack either side', () => {
        const w = nairobiDayWindow('2026-11-17');
        expect(w.start.toISOString()).toBe('2026-11-16T21:00:00.000Z');
        expect(w.end.toISOString()).toBe('2026-11-17T21:00:00.000Z');
        expect(w.fetchFrom.toISOString()).toBe('2026-11-16T20:00:00.000Z');
        expect(w.fetchTo.toISOString()).toBe('2026-11-17T22:00:00.000Z');
    });

    test('rejects anything that is not a date', () => {
        expect(() => nairobiDayWindow('2026-13-01')).toThrow();
        expect(() => nairobiDayWindow('yesterday')).toThrow();
    });

    test('yesterday and the hour follow Nairobi time, not UTC', () => {
        // 22:30 UTC on the 17th is 01:30 on the 18th in Nairobi.
        const late = new Date('2026-11-17T22:30:00Z');
        expect(previousNairobiDay(late)).toBe('2026-11-17');
        expect(nairobiHour(late)).toBe(1);
        expect(previousNairobiDay(new Date('2026-11-17T12:00:00Z'))).toBe('2026-11-16');
        expect(previousNairobiDay(new Date('2026-03-01T06:00:00Z'))).toBe('2026-02-28');
    });
});
