import { describe, expect, test } from 'bun:test';
import { buildQuote, cartQuoteSchema, mergeQuoteItems, quoteLine, type QuoteInputs, type QuoteVariantRow } from './quote';
import type { CartQuoteRequestItem } from 'shared/dist';

const NOW = new Date('2026-10-08T12:00:00Z').getTime();

const buildCartQuote = (items: CartQuoteRequestItem[], rows: QuoteVariantRow[], threshold: number, now: number, extra: Partial<QuoteInputs> = {}) =>
    buildQuote({ items, rows, freeDeliveryThreshold: threshold, mode: 'online', now, ...extra });

const row = (overrides: Partial<QuoteVariantRow> = {}): QuoteVariantRow => ({
    variant_id: 1,
    product_id: 10,
    sku: 'SHO-FLATS-BLK-38',
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

describe('buildQuote: lines and totals', () => {
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

describe('buildQuote: discount, delivery and total', () => {
    const code = (o: Record<string, unknown> = {}) => ({
        id: 7, code: 'WELCOME10', value: '10', min_order_amount: '0', usage_limit: null, used_count: 0,
        expires_at: null, is_active: true, ...o,
    });
    const nairobi = { id: 3, name: 'Nairobi CBD', price: '300', is_active: true };
    const bag = [{ variant_id: 1, quantity: 1 }]; // KES 3,900

    test('online total: subtotal − discount (rounded down) + delivery', () => {
        const quote = buildCartQuote(bag, [row()], 0, NOW, {
            discount: { requested: 'welcome10', code: code(), phone: '254700000001', phoneAlreadyUsed: false, signedIn: true, accountAlreadyUsed: false },
            delivery: { requestedId: 3, location: nairobi },
        });
        expect(quote.discount).toEqual({ code: 'WELCOME10', amount: 390 });
        expect(quote.delivery).toEqual({ location_id: '3', name: 'Nairobi CBD', price: 300, cost: 300 });
        expect(quote.total).toBe(3900 - 390 + 300);
        expect(quote.problems).toEqual([]);
    });

    test('free delivery is judged before the discount, so the bag page promise holds', () => {
        // Threshold 3,800: the 3,900 bag qualifies, even though 10% off brings it to 3,510.
        const quote = buildCartQuote(bag, [row()], 3800, NOW, {
            discount: { requested: 'WELCOME10', code: code(), phone: '254700000001', phoneAlreadyUsed: false, signedIn: true, accountAlreadyUsed: false },
            delivery: { requestedId: 3, location: nairobi },
        });
        expect(quote.qualifies_for_free_delivery).toBe(true);
        expect(quote.delivery?.cost).toBe(0);
        expect(quote.total).toBe(3510);
    });

    test('a code needs the phone number (one use per phone)', () => {
        const quote = buildCartQuote(bag, [row()], 0, NOW, { discount: { requested: 'WELCOME10', code: code(), phone: null, phoneAlreadyUsed: false, signedIn: true, accountAlreadyUsed: false } });
        expect(quote.discount).toBeNull();
        expect(quote.discount_problem).toContain('phone number');
        expect(quote.problems).toContain(quote.discount_problem!);
    });

    test.each([
        [{ code: undefined }, 'not found'],
        [{ code: code({ is_active: false }) }, 'not active'],
        [{ code: code({ expires_at: '2026-10-01T00:00:00Z' }) }, 'expired'],
        [{ code: code({ usage_limit: 5, used_count: 5 }) }, 'usage limit'],
        [{ code: code({ min_order_amount: '5000' }) }, 'at least KES 5000.00'],
        [{ code: code(), phoneAlreadyUsed: true }, 'already used'],
    ])('unusable code → no discount, a reason, and the order is blocked (%#)', (over, reason) => {
        const quote = buildCartQuote(bag, [row()], 0, NOW, {
            discount: { requested: 'WELCOME10', code: code(), phone: '254700000001', phoneAlreadyUsed: false, ...over } as QuoteInputs['discount'],
            delivery: { requestedId: 3, location: nairobi },
        });
        expect(quote.discount).toBeNull();
        expect(quote.discount_problem).toContain(reason);
        expect(quote.total).toBe(4200);
        expect(quote.problems).toHaveLength(1);
    });

    test('a signed-in-only code needs an account, once per account', () => {
        const withAccount = (signedIn: boolean, accountAlreadyUsed = false) => buildCartQuote(bag, [row()], 0, NOW, {
            discount: { requested: 'WELCOME10', code: code({ requires_account: true }), phone: '254700000001', phoneAlreadyUsed: false, signedIn, accountAlreadyUsed },
            delivery: { requestedId: 3, location: nairobi },
        });
        expect(withAccount(false).discount_problem).toBe('Sign in to use this code');
        expect(withAccount(true).discount).toEqual({ code: 'WELCOME10', amount: 390 });
        expect(withAccount(true, true).discount_problem).toBe('Your account has already used this code');
    });

    test('an open code works without an account', () => {
        const quote = buildCartQuote(bag, [row()], 0, NOW, {
            discount: { requested: 'GIFT', code: code({ requires_account: false }), phone: '254700000001', phoneAlreadyUsed: false, signedIn: false, accountAlreadyUsed: false },
            delivery: { requestedId: 3, location: nairobi },
        });
        expect(quote.discount?.amount).toBe(390);
    });

    test('no delivery area chosen yet → total without delivery, order blocked', () => {
        const quote = buildCartQuote(bag, [row()], 0, NOW);
        expect(quote.delivery).toBeNull();
        expect(quote.total).toBe(3900);
        expect(quote.problems).toEqual(['Choose a delivery area']);
    });

    test('inactive or missing delivery area blocks the order', () => {
        expect(buildCartQuote(bag, [row()], 0, NOW, { delivery: { requestedId: 3, location: { ...nairobi, is_active: false } } }).problems)
            .toEqual(['That delivery area is no longer available']);
        expect(buildCartQuote(bag, [row()], 0, NOW, { delivery: { requestedId: 9 } }).problems)
            .toEqual(['That delivery area is no longer available']);
    });

    test('walk-ins: no delivery, no codes', () => {
        const quote = buildQuote({ items: bag, rows: [row()], freeDeliveryThreshold: 0, mode: 'walk_in', now: NOW });
        expect(quote.total).toBe(3900);
        expect(quote.problems).toEqual([]);
        const withCode = buildQuote({
            items: bag, rows: [row()], freeDeliveryThreshold: 0, mode: 'walk_in', now: NOW,
            discount: { requested: 'WELCOME10', code: code(), phone: '254700000001', phoneAlreadyUsed: false, signedIn: true, accountAlreadyUsed: false },
        });
        expect(withCode.discount).toBeNull();
        expect(withCode.problems).toEqual(["Discount codes can't be used on walk-in sales"]);
    });

    test('a bag needing review blocks the order', () => {
        const quote = buildCartQuote([{ variant_id: 1, quantity: 9 }], [row()], 0, NOW, { delivery: { requestedId: 3, location: nairobi } });
        expect(quote.problems).toEqual(['Some items in your bag have changed: review your bag']);
    });
});
