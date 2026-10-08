import { describe, expect, test } from 'bun:test';
import { buildCartQuote, cartQuoteSchema, mergeQuoteItems, quoteLine, type QuoteVariantRow } from './cart-quote';

const NOW = new Date('2026-10-08T12:00:00Z').getTime();

const row = (overrides: Partial<QuoteVariantRow> = {}): QuoteVariantRow => ({
    variant_id: 1,
    product_id: 10,
    size: '38',
    color: 'Black',
    stock: 5,
    price_override: null,
    variant_active: true,
    name: 'Embellished Pointed Flats',
    slug: 'embellished-pointed-flats',
    image_url: 'http://img/flats.webp',
    price: '3900.00',
    sale_price: null,
    sale_ends_at: null,
    product_active: true,
    ...overrides,
});

describe('quoteLine', () => {
    test('in stock → ok at full quantity', () => {
        const line = quoteLine({ variant_id: 1, quantity: 2 }, row(), NOW);
        expect(line.status).toBe('ok');
        expect(line.purchasable_quantity).toBe(2);
        expect(line.unit_price).toBe(3900);
        expect(line.line_total).toBe(7800);
    });

    test('quantity equal to stock is still ok', () => {
        expect(quoteLine({ variant_id: 1, quantity: 5 }, row(), NOW).status).toBe('ok');
    });

    test('more than stock → insufficient, capped to stock', () => {
        const line = quoteLine({ variant_id: 1, quantity: 8 }, row({ stock: 2 }), NOW);
        expect(line.status).toBe('insufficient_stock');
        expect(line.purchasable_quantity).toBe(2);
        expect(line.line_total).toBe(7800);
    });

    test('zero stock → out of stock with nothing purchasable', () => {
        const line = quoteLine({ variant_id: 1, quantity: 1 }, row({ stock: 0 }), NOW);
        expect(line.status).toBe('out_of_stock');
        expect(line.purchasable_quantity).toBe(0);
        expect(line.line_total).toBe(0);
    });

    test('negative stock is treated as zero', () => {
        expect(quoteLine({ variant_id: 1, quantity: 1 }, row({ stock: -3 }), NOW).stock).toBe(0);
    });

    test('missing variant → unavailable', () => {
        const line = quoteLine({ variant_id: 99, quantity: 1 }, undefined, NOW);
        expect(line.status).toBe('unavailable');
        expect(line.unit_price).toBeNull();
        expect(line.product_name).toBeNull();
    });

    test('deactivated variant → unavailable', () => {
        expect(quoteLine({ variant_id: 1, quantity: 1 }, row({ variant_active: false }), NOW).status).toBe('unavailable');
    });

    test('deactivated product → unavailable but keeps its name for the message', () => {
        const line = quoteLine({ variant_id: 1, quantity: 1 }, row({ product_active: false }), NOW);
        expect(line.status).toBe('unavailable');
        expect(line.product_name).toBe('Embellished Pointed Flats');
    });

    test('uses the sale price and reports the list price to strike through', () => {
        const line = quoteLine({ variant_id: 1, quantity: 1 }, row({ sale_price: '2900.00' }), NOW);
        expect(line.unit_price).toBe(2900);
        expect(line.compare_at_price).toBe(3900);
    });
});

describe('mergeQuoteItems', () => {
    test('sums quantities of repeated variants', () => {
        expect(mergeQuoteItems([
            { variant_id: 1, quantity: 2 },
            { variant_id: 2, quantity: 1 },
            { variant_id: 1, quantity: 3 },
        ])).toEqual([{ variant_id: 1, quantity: 5 }, { variant_id: 2, quantity: 1 }]);
    });
});

describe('buildCartQuote', () => {
    test('repeated variants cannot bypass the stock check', () => {
        const quote = buildCartQuote(
            [{ variant_id: 1, quantity: 2 }, { variant_id: 1, quantity: 2 }],
            [row({ stock: 3 })],
            0,
            NOW,
        );
        expect(quote.lines).toHaveLength(1);
        expect(quote.lines[0]!.status).toBe('insufficient_stock');
        expect(quote.can_checkout).toBe(false);
    });

    test('totals, item count and free-delivery gap', () => {
        const quote = buildCartQuote(
            [{ variant_id: 1, quantity: 2 }, { variant_id: 2, quantity: 1 }],
            [row(), row({ variant_id: 2, price: '2500.00', stock: 4 })],
            10000,
            NOW,
        );
        expect(quote.subtotal).toBe(10300);
        expect(quote.item_count).toBe(3);
        expect(quote.amount_to_free_delivery).toBe(0);
        expect(quote.can_checkout).toBe(true);
    });

    test('amount to free delivery when below threshold', () => {
        const quote = buildCartQuote([{ variant_id: 1, quantity: 1 }], [row()], 10000, NOW);
        expect(quote.amount_to_free_delivery).toBe(6100);
    });

    test('no threshold configured → gap is zero', () => {
        expect(buildCartQuote([{ variant_id: 1, quantity: 1 }], [row()], 0, NOW).amount_to_free_delivery).toBe(0);
    });

    test('any problem line blocks checkout', () => {
        const quote = buildCartQuote(
            [{ variant_id: 1, quantity: 1 }, { variant_id: 2, quantity: 1 }],
            [row()],
            0,
            NOW,
        );
        expect(quote.lines[1]!.status).toBe('unavailable');
        expect(quote.can_checkout).toBe(false);
    });

    test('empty cart cannot check out', () => {
        expect(buildCartQuote([], [], 0, NOW).can_checkout).toBe(false);
    });
});

describe('cartQuoteSchema', () => {
    test('rejects zero and fractional quantities', () => {
        expect(cartQuoteSchema.safeParse({ items: [{ variant_id: 1, quantity: 0 }] }).success).toBe(false);
        expect(cartQuoteSchema.safeParse({ items: [{ variant_id: 1, quantity: 1.5 }] }).success).toBe(false);
    });
    test('rejects more than 50 lines', () => {
        const items = Array.from({ length: 51 }, (_, i) => ({ variant_id: i + 1, quantity: 1 }));
        expect(cartQuoteSchema.safeParse({ items }).success).toBe(false);
    });
    test('accepts a valid cart', () => {
        expect(cartQuoteSchema.safeParse({ items: [{ variant_id: 3, quantity: 2 }] }).success).toBe(true);
    });
});
