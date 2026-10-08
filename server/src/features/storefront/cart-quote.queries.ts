import { sql } from '../../lib/db';
import { settingsQueries } from '../settings/settings.queries';
import { buildCartQuote, mergeQuoteItems, type QuoteVariantRow } from './cart-quote';
import type { CartQuoteRequestItem } from 'shared/dist';

export async function getCartQuote(items: CartQuoteRequestItem[], db = sql) {
    const variantIds = mergeQuoteItems(items).map(item => item.variant_id);
    const rows = variantIds.length === 0 ? [] : await db<QuoteVariantRow[]>`
        SELECT pv.id AS variant_id, pv.product_id, pv.size, pv.color, pv.stock, pv.price_override,
               pv.is_active AS variant_active, p.name, p.slug, p.image_url, p.price, p.sale_price,
               p.sale_ends_at, p.is_active AS product_active
        FROM product_variants pv JOIN products p ON p.id = pv.product_id
        WHERE pv.id IN ${db(variantIds)}
    `;
    const threshold = await settingsQueries.getNumber('free_delivery_threshold');
    return buildCartQuote(items, rows.map(row => ({
        ...row, variant_id: Number(row.variant_id), product_id: Number(row.product_id),
    })), threshold);
}
