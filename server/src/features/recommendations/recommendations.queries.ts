import type { RecommendationRail } from 'shared/dist';
import { sql } from '../../lib/db';
import type { Candidate, TogetherCounts } from './recommend';

/** Catalogues are small (dozens to hundreds of pieces), so ranking loads them whole. */
const CANDIDATE_CAP = 2000;

export const recommendationsQueries = {
    /** Every active product, in the shape the ranking needs. */
    candidates: async (): Promise<Candidate[]> => {
        const rows = await sql<{
            id: number; category_id: number; root_category_id: number; price: string; in_stock: boolean; colors: string[] | null;
            is_featured: boolean; rating_average: string | null; rating_count: number;
        }[]>`
            SELECT p.id, p.category_id, COALESCE(c.parent_id, c.id) AS root_category_id,
                   CASE WHEN p.sale_price IS NOT NULL AND (p.sale_ends_at IS NULL OR p.sale_ends_at > NOW())
                        THEN p.sale_price ELSE p.price END AS price,
                   COALESCE(v.in_stock, false) AS in_stock, v.colors, p.is_featured,
                   r.average AS rating_average, COALESCE(r.count, 0)::int AS rating_count
            FROM products p
            JOIN categories c ON c.id = p.category_id
            LEFT JOIN LATERAL (
                SELECT bool_or(pv.stock > 0) AS in_stock,
                       array_remove(array_agg(DISTINCT lower(trim(pv.color))), NULL) AS colors
                FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active
            ) v ON true
            LEFT JOIN LATERAL (
                SELECT ROUND(AVG(rating)::numeric, 1) AS average, COUNT(*) AS count
                FROM product_reviews pr WHERE pr.product_id = p.id AND pr.status = 'APPROVED'
            ) r ON true
            WHERE p.is_active
            ORDER BY p.created_at DESC, p.id DESC
            LIMIT ${CANDIDATE_CAP}
        `;
        return rows.map((r) => ({
            id: Number(r.id),
            categoryId: Number(r.category_id),
            rootCategoryId: Number(r.root_category_id),
            price: Number(r.price),
            inStock: Boolean(r.in_stock),
            colors: (r.colors ?? []).filter(Boolean),
            featured: Boolean(r.is_featured),
            ratingAverage: r.rating_average != null ? Number(r.rating_average) : null,
            ratingCount: Number(r.rating_count),
        }));
    },

    /**
     * For each anchor product, how many paid orders also contained each other product. Cancelled
     * and refunded orders don't count.
     */
    boughtTogether: async (productIds: number[]): Promise<Map<number, TogetherCounts>> => {
        const result = new Map<number, Map<number, number>>();
        if (productIds.length === 0) return result;
        const rows = await sql<{ anchor: number; other: number; orders: number }[]>`
            SELECT a.product_id AS anchor, b.product_id AS other, COUNT(DISTINCT a.order_id)::int AS orders
            FROM order_items a
            JOIN order_items b ON b.order_id = a.order_id AND b.product_id <> a.product_id
            JOIN orders o ON o.id = a.order_id
            WHERE a.product_id IN ${sql(productIds)}
              AND o.payment_status = 'PAID' AND o.status NOT IN ('CANCELLED', 'REFUNDED')
            GROUP BY a.product_id, b.product_id
        `;
        for (const row of rows) {
            const anchor = Number(row.anchor);
            if (!result.has(anchor)) result.set(anchor, new Map());
            result.get(anchor)!.set(Number(row.other), Number(row.orders));
        }
        return result;
    },

    /** Staff picks per product, in their order. */
    staffPicks: async (productIds: number[]): Promise<Map<number, number[]>> => {
        const result = new Map<number, number[]>();
        if (productIds.length === 0) return result;
        const rows = await sql<{ product_id: number; paired_product_id: number }[]>`
            SELECT product_id, paired_product_id FROM product_pairings
            WHERE product_id IN ${sql(productIds)} ORDER BY product_id, position, created_at
        `;
        for (const row of rows) {
            const list = result.get(Number(row.product_id)) ?? [];
            list.push(Number(row.paired_product_id));
            result.set(Number(row.product_id), list);
        }
        return result;
    },

    /** Category id → the categories that go with it. */
    categoryPairings: async (): Promise<Map<number, number[]>> => {
        const rows = await sql<{ category_id: number; paired_category_id: number }[]>`
            SELECT category_id, paired_category_id FROM category_pairings ORDER BY category_id, position
        `;
        const result = new Map<number, number[]>();
        for (const row of rows) {
            const list = result.get(Number(row.category_id)) ?? [];
            list.push(Number(row.paired_category_id));
            result.set(Number(row.category_id), list);
        }
        return result;
    },

    /** Active products by id, in the storefront listing shape (stock counts included), in the given order. */
    listingByIds: async (productIds: number[]) => {
        if (productIds.length === 0) return [];
        const rows = await sql<any[]>`
            SELECT p.*,
                COALESCE(SUM(pv.stock) FILTER (WHERE pv.is_active = true), 0) AS total_stock,
                COUNT(*) FILTER (WHERE pv.is_active = true AND pv.stock > 0 AND pv.stock <= pv.low_stock_threshold) AS low_stock_variant_count,
                COUNT(*) FILTER (WHERE pv.is_active = true AND pv.stock = 0) AS out_of_stock_variant_count
            FROM products p
            LEFT JOIN product_variants pv ON pv.product_id = p.id
            WHERE p.id IN ${sql(productIds)} AND p.is_active
            GROUP BY p.id
        `;
        const byId = new Map(rows.map((r) => [Number(r.id), r]));
        return productIds.map((id) => byId.get(id)).filter(Boolean);
    },

    /** Counts a rail being seen or clicked, per day only. */
    recordEvent: async (rail: RecommendationRail, event: 'impression' | 'click') => {
        const impressions = event === 'impression' ? 1 : 0;
        const clicks = event === 'click' ? 1 : 0;
        await sql`
            INSERT INTO recommendation_stats (day, rail, impressions, clicks)
            VALUES ((now() AT TIME ZONE 'Africa/Nairobi')::date, ${rail}, ${impressions}, ${clicks})
            ON CONFLICT (day, rail) DO UPDATE SET
                impressions = recommendation_stats.impressions + EXCLUDED.impressions,
                clicks = recommendation_stats.clicks + EXCLUDED.clicks
        `;
    },

    stats: async (days: number) => {
        return await sql<{ rail: RecommendationRail; impressions: number; clicks: number }[]>`
            SELECT rail, SUM(impressions)::int AS impressions, SUM(clicks)::int AS clicks
            FROM recommendation_stats
            WHERE day > (now() AT TIME ZONE 'Africa/Nairobi')::date - ${days}::int
            GROUP BY rail
        `;
    },

    // ── Admin ────────────────────────────────────────────────────────────────

    pairedProducts: async (productId: number) => {
        return await sql<{ id: number; name: string; image_url: string | null; is_active: boolean; in_stock: boolean }[]>`
            SELECT p.id, p.name, p.image_url, p.is_active,
                   COALESCE((SELECT bool_or(pv.stock > 0) FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active), false) AS in_stock
            FROM product_pairings pp JOIN products p ON p.id = pp.paired_product_id
            WHERE pp.product_id = ${productId}
            ORDER BY pp.position, pp.created_at
        `;
    },

    setPairedProducts: async (productId: number, pairedIds: number[]) => {
        await sql.begin(async (tx) => {
            await tx`DELETE FROM product_pairings WHERE product_id = ${productId}`;
            for (const [position, id] of pairedIds.entries()) {
                await tx`INSERT INTO product_pairings (product_id, paired_product_id, position) VALUES (${productId}, ${id}, ${position})`;
            }
        });
    },

    existingProductIds: async (ids: number[]): Promise<Set<number>> => {
        if (ids.length === 0) return new Set();
        const rows = await sql<{ id: number }[]>`SELECT id FROM products WHERE id IN ${sql(ids)}`;
        return new Set(rows.map((r) => Number(r.id)));
    },

    topLevelCategoryIds: async (): Promise<Set<number>> => {
        const rows = await sql<{ id: number }[]>`SELECT id FROM categories WHERE parent_id IS NULL`;
        return new Set(rows.map((r) => Number(r.id)));
    },

    setCategoryPairings: async (categoryId: number, pairedIds: number[]) => {
        await sql.begin(async (tx) => {
            await tx`DELETE FROM category_pairings WHERE category_id = ${categoryId}`;
            for (const [position, id] of pairedIds.entries()) {
                await tx`INSERT INTO category_pairings (category_id, paired_category_id, position) VALUES (${categoryId}, ${id}, ${position})`;
            }
        });
    },
};
