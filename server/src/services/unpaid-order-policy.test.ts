import { describe, expect, test } from 'bun:test';
import { shouldCancelExpiredOrder } from './unpaid-order-policy';

const TTL = 45 * 60 * 1000;

describe('shouldCancelExpiredOrder', () => {
    test('no payment ever started → cancel', () => {
        expect(shouldCancelExpiredOrder('none', TTL + 1, TTL)).toBe(true);
    });
    test('Pesapal says not paid → cancel', () => {
        expect(shouldCancelExpiredOrder('not_paid', TTL + 1, TTL)).toBe(true);
    });
    test('Pesapal says paid → keep (it was just confirmed)', () => {
        expect(shouldCancelExpiredOrder('paid', TTL * 10, TTL)).toBe(false);
    });
    test('Pesapal unreachable shortly after the window → wait', () => {
        expect(shouldCancelExpiredOrder('error', TTL + 1, TTL)).toBe(false);
        expect(shouldCancelExpiredOrder('error', TTL * 3 - 1, TTL)).toBe(false);
    });
    test('Pesapal unreachable long after the window → cancel anyway', () => {
        expect(shouldCancelExpiredOrder('error', TTL * 3, TTL)).toBe(true);
    });
});
