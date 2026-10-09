import { sql } from '../../lib/db';
import { normalisePhone } from '../../lib/phone';
import { settingsQueries } from '../settings/settings.queries';
import type { CartQuoteRequestItem } from 'shared/dist';
import { buildQuote, mergeQuoteItems, type Quote, type QuoteInputs, type QuoteLocation, type QuoteVariantRow } from './quote';
import type { DiscountRuleCode } from './discount-rules';

export interface QuoteRequest {
    items: CartQuoteRequestItem[];
    discount_code?: string;
    phone?: string;
    shipping_location_id?: number;
}

/** Loads everything a quote needs in a handful of queries (not one per item) and prices it. */
export async function quoteOrder(request: QuoteRequest, options: { mode?: QuoteInputs['mode']; db?: typeof sql } = {}): Promise<Quote> {
    const db = options.db ?? sql;
    const variantIds = mergeQuoteItems(request.items).map((item) => item.variant_id);
    const rows = variantIds.length === 0 ? [] : await db<QuoteVariantRow[]>`
        SELECT pv.id AS variant_id, pv.product_id, pv.sku, pv.size, pv.color, pv.stock, pv.price_override,
               pv.is_active AS variant_active, p.name, p.slug, p.image_url, p.price, p.sale_price,
               p.sale_ends_at, p.is_active AS product_active
        FROM product_variants pv JOIN products p ON p.id = pv.product_id
        WHERE pv.id IN ${db(variantIds)}
    `;

    const requestedCode = request.discount_code?.trim();
    const phone = request.phone?.trim() ? normalisePhone(request.phone) : null;
    let discount: QuoteInputs['discount'];
    if (requestedCode) {
        const [code] = await db<(DiscountRuleCode & { id: number })[]>`
            SELECT * FROM discount_codes WHERE UPPER(code) = ${requestedCode.toUpperCase()}
        `;
        const [used] = code && phone
            ? await db`SELECT 1 FROM discount_code_usages WHERE code_id = ${code.id} AND phone = ${phone} LIMIT 1`
            : [];
        discount = { requested: requestedCode, code, phone, phoneAlreadyUsed: Boolean(used) };
    }

    let delivery: QuoteInputs['delivery'];
    if (request.shipping_location_id != null) {
        const [location] = await db<QuoteLocation[]>`
            SELECT id, name, price, is_active FROM shipping_locations WHERE id = ${request.shipping_location_id}
        `;
        delivery = { requestedId: request.shipping_location_id, location: location ? { ...location, id: Number(location.id) } : undefined };
    }

    return buildQuote({
        items: request.items,
        rows: rows.map((row) => ({ ...row, variant_id: Number(row.variant_id), product_id: Number(row.product_id) })),
        freeDeliveryThreshold: await settingsQueries.getNumber('free_delivery_threshold'),
        mode: options.mode ?? 'online',
        discount,
        delivery,
    });
}
