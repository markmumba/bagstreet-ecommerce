import { describe, expect, test } from 'bun:test';
import { ORDER_LIMITS, orderLimitViolation } from './order-limits';

describe('orderLimitViolation', () => {
    test('a first order is allowed', () => {
        expect(orderLimitViolation({ openUnpaid: 0, lastHour: 0 })).toBeNull();
    });
    test('one unpaid order open → a second is allowed', () => {
        expect(orderLimitViolation({ openUnpaid: 1, lastHour: 1 })).toBeNull();
    });
    test('at the unpaid cap → blocked with an unpaid-orders reason', () => {
        expect(orderLimitViolation({ openUnpaid: ORDER_LIMITS.maxOpenUnpaid, lastHour: 2 })).toContain('unpaid orders');
    });
    test('at the hourly cap → blocked with an hourly reason', () => {
        expect(orderLimitViolation({ openUnpaid: 0, lastHour: ORDER_LIMITS.maxPerHour })).toContain('last hour');
    });
    test('just under the hourly cap → allowed', () => {
        expect(orderLimitViolation({ openUnpaid: 0, lastHour: ORDER_LIMITS.maxPerHour - 1 })).toBeNull();
    });
    test('custom limits are respected', () => {
        expect(orderLimitViolation({ openUnpaid: 1, lastHour: 0 }, { maxOpenUnpaid: 1, maxPerHour: 10 })).not.toBeNull();
    });
});
