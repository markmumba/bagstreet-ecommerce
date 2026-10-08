import { z } from 'zod';
import type { CartQuoteLine, CartQuoteRequestItem, CartQuoteResponse } from 'shared/dist';
import { resolveCompareAtPrice, resolveUnitPrice, roundMoney } from '@server/lib/pricing';

export const cartQuoteSchema = z.object({
    items: z.array(z.object({
        variant_id: z.number().int().positive(),
        quantity: z.number().int().min(1, 'Quantity must be at least 1').max(100, 'Quantity cannot exceed 100'),
    })).max(50, 'A cart can hold at most 50 different items'),
});

/** Variant joined with its product, as loaded for a quote. */
export interface QuoteVariantRow {
    variant_id: number;
    product_id: number;
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

export function buildCartQuote(
    items: CartQuoteRequestItem[],
    rows: QuoteVariantRow[],
    freeDeliveryThreshold: number,
    now: number = Date.now(),
): CartQuoteResponse {
    const rowsById = new Map(rows.map((row) => [row.variant_id, row]));
    const lines = mergeQuoteItems(items).map((item) => quoteLine(item, rowsById.get(item.variant_id), now));
    const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.line_total, 0));

    return {
        lines,
        subtotal,
        item_count: lines.reduce((sum, line) => sum + line.purchasable_quantity, 0),
        free_delivery_threshold: freeDeliveryThreshold,
        amount_to_free_delivery: freeDeliveryThreshold > 0 ? roundMoney(Math.max(0, freeDeliveryThreshold - subtotal)) : 0,
        can_checkout: lines.length > 0 && lines.every((line) => line.status === 'ok'),
    };
}
