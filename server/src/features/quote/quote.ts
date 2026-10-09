/**
 * Order quote: the one place an order's price is worked out. The bag page, the checkout summary,
 * online order creation and walk-in sales all use it, so what the customer sees is what they pay.
 *
 * Pure: the loader in quote.queries.ts fetches the rows, this decides. Rules:
 * - each line at its current price (sale, variant override), capped to stock with a status;
 * - a discount code: percentage of the subtotal, rounded down (see discount-rules.ts);
 * - free delivery when the subtotal reaches the threshold, judged *before* any discount, so the
 *   bag page's promise holds at checkout;
 * - total = subtotal − discount + delivery.
 */
import { z } from 'zod';
import type { CartQuoteLine, CartQuoteRequestItem, CartQuoteResponse } from 'shared/dist';
import { resolveCompareAtPrice, resolveUnitPrice, roundMoney } from '../../lib/pricing';
import { evaluateDiscount, type DiscountRuleCode } from './discount-rules';

const quoteItems = z.array(z.object({
    variant_id: z.number().int().positive(),
    quantity: z.number().int().min(1, 'Quantity must be at least 1').max(100, 'Quantity cannot exceed 100'),
})).max(50, 'A cart can hold at most 50 different items');

/** Just the bag (cart recovery saves this). */
export const cartItemsSchema = z.object({ items: quoteItems });

export const cartQuoteSchema = cartItemsSchema.extend({
    discount_code: z.string().trim().max(50).optional(),
    phone: z.string().trim().max(30).optional(),
    shipping_location_id: z.number().int().positive().optional(),
});

/** Variant joined with its product, as loaded for a quote. */
export interface QuoteVariantRow {
    variant_id: number;
    product_id: number;
    sku: string;
    size: string | null;
    color: string | null;
    stock: number;
    price_override: string | null;
    variant_active: boolean;
    name: string;
    slug: string | null;
    image_url: string | null;
    price: string;
    sale_price: string | null;
    sale_ends_at: string | Date | null;
    product_active: boolean;
}

export interface QuoteLocation {
    id: number;
    name: string;
    price: string | number;
    is_active: boolean;
}

export interface QuoteInputs {
    items: CartQuoteRequestItem[];
    rows: QuoteVariantRow[];
    freeDeliveryThreshold: number;
    /** Walk-in sales have no delivery and take no discount codes. */
    mode: 'online' | 'walk_in';
    discount?: { requested: string; code?: DiscountRuleCode & { id: number }; phone: string | null; phoneAlreadyUsed: boolean };
    delivery?: { requestedId: number; location?: QuoteLocation };
    now?: number;
}

/** The quote plus what order creation needs but the customer doesn't see. */
export interface Quote extends CartQuoteResponse {
    discount_code_id: number | null;
}

/** Merges repeated variants so the same item can't dodge the stock check by appearing twice. */
export function mergeQuoteItems(items: CartQuoteRequestItem[]): CartQuoteRequestItem[] {
    const merged = new Map<number, number>();
    for (const item of items) {
        merged.set(item.variant_id, (merged.get(item.variant_id) ?? 0) + item.quantity);
    }
    return [...merged].map(([variant_id, quantity]) => ({ variant_id, quantity }));
}

export function quoteLine(item: CartQuoteRequestItem, row: QuoteVariantRow | undefined, now: number = Date.now()): CartQuoteLine {
    const base = {
        variant_id: item.variant_id,
        requested_quantity: item.quantity,
        product_id: row ? String(row.product_id) : null,
        product_slug: row?.slug ?? null,
        product_name: row?.name ?? null,
        image_url: row?.image_url ?? null,
        sku: row?.sku ?? null,
        size: row?.size ?? null,
        color: row?.color ?? null,
    };

    if (!row || !row.variant_active || !row.product_active) {
        return { ...base, status: 'unavailable', purchasable_quantity: 0, unit_price: null, compare_at_price: null, line_total: 0, stock: 0 };
    }

    const stock = Math.max(0, row.stock);
    const unitPrice = resolveUnitPrice(row, row, now);
    const purchasable = Math.min(item.quantity, stock);
    const status = stock === 0 ? 'out_of_stock' : item.quantity > stock ? 'insufficient_stock' : 'ok';

    return {
        ...base,
        status,
        purchasable_quantity: purchasable,
        unit_price: unitPrice,
        compare_at_price: resolveCompareAtPrice(row, row, now),
        line_total: roundMoney(unitPrice * purchasable),
        stock,
    };
}

export function buildQuote(input: QuoteInputs): Quote {
    const now = input.now ?? Date.now();
    const rowsById = new Map(input.rows.map((row) => [row.variant_id, row]));
    const lines = mergeQuoteItems(input.items).map((item) => quoteLine(item, rowsById.get(item.variant_id), now));
    const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.line_total, 0));
    const canCheckout = lines.length > 0 && lines.every((line) => line.status === 'ok');
    const threshold = input.freeDeliveryThreshold;
    const qualifiesForFreeDelivery = threshold > 0 && subtotal >= threshold;

    // Discount
    let discount: Quote['discount'] = null;
    let discountCodeId: number | null = null;
    let discountProblem: string | null = null;
    if (input.discount?.requested) {
        if (input.mode === 'walk_in') {
            discountProblem = "Discount codes can't be used on walk-in sales";
        } else if (!input.discount.phone) {
            discountProblem = 'Add your phone number to use a code: each code is one use per phone';
        } else {
            const verdict = evaluateDiscount(input.discount.code, { subtotal, phoneAlreadyUsed: input.discount.phoneAlreadyUsed, now });
            if (verdict.ok) {
                discount = { code: input.discount.code!.code, amount: Math.min(verdict.amount, subtotal) };
                discountCodeId = input.discount.code!.id;
            } else {
                discountProblem = verdict.reason;
            }
        }
    }

    // Delivery
    let delivery: Quote['delivery'] = null;
    let deliveryProblem: string | null = null;
    if (input.mode === 'online' && input.delivery) {
        const location = input.delivery.location;
        if (!location || !location.is_active) {
            deliveryProblem = 'That delivery area is no longer available';
        } else {
            const price = roundMoney(Number(location.price));
            delivery = { location_id: String(location.id), name: location.name, price, cost: qualifiesForFreeDelivery ? 0 : price };
        }
    }

    const problems: string[] = [];
    if (lines.length === 0) problems.push('Your bag is empty');
    else if (!canCheckout) problems.push('Some items in your bag have changed: review your bag');
    if (input.mode === 'online' && !input.delivery) problems.push('Choose a delivery area');
    if (deliveryProblem) problems.push(deliveryProblem);
    if (discountProblem) problems.push(discountProblem);

    return {
        lines,
        subtotal,
        item_count: lines.reduce((sum, line) => sum + line.purchasable_quantity, 0),
        free_delivery_threshold: threshold,
        amount_to_free_delivery: threshold > 0 ? roundMoney(Math.max(0, threshold - subtotal)) : 0,
        qualifies_for_free_delivery: qualifiesForFreeDelivery,
        can_checkout: canCheckout,
        discount,
        discount_problem: discountProblem,
        delivery,
        total: roundMoney(Math.max(0, subtotal - (discount?.amount ?? 0)) + (delivery?.cost ?? 0)),
        problems,
        discount_code_id: discountCodeId,
    };
}

/** What the storefront receives (drops internal ids). */
export function toQuoteResponse({ discount_code_id: _, ...response }: Quote): CartQuoteResponse {
    return response;
}
