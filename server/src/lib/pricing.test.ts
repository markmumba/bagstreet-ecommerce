import { describe, expect, test } from 'bun:test';
import { resolveCompareAtPrice, resolveUnitPrice, roundMoney, saleIsActive } from './pricing';

const NOW = new Date('2026-10-08T12:00:00Z').getTime();
const product = (overrides: Partial<{ price: string; sale_price: string | null; sale_ends_at: string | null }> = {}) => ({
    price: '7000.00',
    sale_price: null,
    sale_ends_at: null,
    ...overrides,
});

describe('saleIsActive', () => {
    test('no sale price → inactive', () => {
        expect(saleIsActive(product(), NOW)).toBe(false);
    });
    test('sale with no end date → active', () => {
        expect(saleIsActive(product({ sale_price: '5000' }), NOW)).toBe(true);
    });
    test('sale ending in the future → active', () => {
        expect(saleIsActive(product({ sale_price: '5000', sale_ends_at: '2026-10-09T00:00:00Z' }), NOW)).toBe(true);
    });
    test('sale that has ended → inactive', () => {
        expect(saleIsActive(product({ sale_price: '5000', sale_ends_at: '2026-10-08T11:59:59Z' }), NOW)).toBe(false);
    });
});

describe('resolveUnitPrice', () => {
    test('list price by default', () => {
        expect(resolveUnitPrice(product(), { price_override: null }, NOW)).toBe(7000);
    });
    test('active sale beats list price', () => {
        expect(resolveUnitPrice(product({ sale_price: '5000' }), { price_override: null }, NOW)).toBe(5000);
    });
    test('variant override beats an active sale', () => {
        expect(resolveUnitPrice(product({ sale_price: '5000' }), { price_override: '6500' }, NOW)).toBe(6500);
    });
    test('expired sale falls back to list price', () => {
        expect(resolveUnitPrice(product({ sale_price: '5000', sale_ends_at: '2026-01-01T00:00:00Z' }), { price_override: null }, NOW)).toBe(7000);
    });
    test('accepts numeric money values', () => {
        expect(resolveUnitPrice({ price: 3900, sale_price: null, sale_ends_at: null }, { price_override: null }, NOW)).toBe(3900);
    });
});

describe('resolveCompareAtPrice', () => {
    test('null when paying list price', () => {
        expect(resolveCompareAtPrice(product(), { price_override: null }, NOW)).toBeNull();
    });
    test('list price when on sale', () => {
        expect(resolveCompareAtPrice(product({ sale_price: '5000' }), { price_override: null }, NOW)).toBe(7000);
    });
    test('null when an override is above list price', () => {
        expect(resolveCompareAtPrice(product(), { price_override: '7500' }, NOW)).toBeNull();
    });
});

test('roundMoney removes float drift', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(19.99 * 3)).toBe(59.97);
});
