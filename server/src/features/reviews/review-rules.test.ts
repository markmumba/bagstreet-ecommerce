import { describe, expect, test } from 'bun:test';
import { canReviewOrder, publicAuthorName, summariseRatings, variantLabel } from './review-rules';

describe('who can review', () => {
    test('only received orders of goods', () => {
        expect(canReviewOrder({ status: 'DELIVERED', order_source: 'ONLINE' })).toEqual({ ok: true });
        expect(canReviewOrder({ status: 'DELIVERED', order_source: 'WALK_IN' })).toEqual({ ok: true });
        expect(canReviewOrder({ status: 'SHIPPED', order_source: 'ONLINE' })).toMatchObject({ ok: false });
        expect(canReviewOrder({ status: 'CONFIRMED', order_source: 'ONLINE' })).toMatchObject({ ok: false });
        expect(canReviewOrder({ status: 'REFUNDED', order_source: 'ONLINE' })).toMatchObject({ ok: false });
        expect(canReviewOrder({ status: 'DELIVERED', order_source: 'GIFT_VOUCHER' })).toMatchObject({ ok: false });
    });
});

describe('the public name', () => {
    test('first name and last initial, never more', () => {
        expect(publicAuthorName('Amani Wanjiku')).toBe('Amani W.');
        expect(publicAuthorName('  amani   wanjiku  njeri ')).toBe('Amani N.');
        expect(publicAuthorName('Amani')).toBe('Amani');
        expect(publicAuthorName('')).toBe('Verified buyer');
        expect(publicAuthorName(null)).toBe('Verified buyer');
    });
    test('an email or phone typed as a name is never shown', () => {
        expect(publicAuthorName('amani@example.com')).toBe('Verified buyer');
        expect(publicAuthorName('0712345678')).toBe('Verified buyer');
    });
});

describe('what was bought', () => {
    test('size and colour, when there are any', () => {
        expect(variantLabel('M', 'Navy')).toBe('M / Navy');
        expect(variantLabel(null, 'Brown')).toBe('Brown');
        expect(variantLabel(null, null)).toBeNull();
    });
});

describe('rating summary', () => {
    test('average to one decimal, count and how many of each star', () => {
        expect(summariseRatings([5, 4, 4, 1])).toEqual({ average: 3.5, count: 4, distribution: { 1: 1, 2: 0, 3: 0, 4: 2, 5: 1 } });
    });
    test('no reviews', () => {
        expect(summariseRatings([])).toEqual({ average: null, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
    });
});
