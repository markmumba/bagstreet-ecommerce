import type {
    CategoryPairingsResponse, ProductPairingsResponse, ProductRecommendationsResponse, RecommendationRail,
    RecommendationStatsResponse, RecommendedProductsResponse,
} from 'shared/dist';
import { RECOMMENDATION_RAIL } from 'shared/dist';
import type { AppContext } from '@server/lib/hono';
import { auditFromContext } from '@server/lib/audit';
import { BadRequestError, NotFoundError, ValidationError } from '@server/lib/errors';
import { success } from '@server/lib/response';
import { attachImages, toProductResponse } from '../storefront/storefront.handlers';
import { recommendComplements, recommendForBag, recommendSimilar, type Candidate } from './recommend';
import { recommendationsQueries as q } from './recommendations.queries';
import {
    bagQuerySchema, categoryPairingsSchema, eventSchema, productPairingsSchema, statsQuerySchema, viewedQuerySchema,
} from './recommendations.schema';

function parse<T>(input: unknown, schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { errors: any } } }): T {
    const result = schema.safeParse(input);
    if (!result.success) throw new ValidationError(result.error.errors?.[0]?.message ?? 'Invalid request', result.error.errors);
    return result.data;
}

const productIdParam = (c: AppContext) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) throw new NotFoundError('Product', c.req.param('id') ?? '');
    return id;
};

/** Ranked candidates → storefront product cards, in order. */
async function toCards(list: Candidate[]) {
    const rows = await q.listingByIds(list.map((c) => c.id));
    return (await attachImages(rows)).map(toProductResponse);
}

/** The categories paired with a product's category (its own pairing, else its top-level one). */
const pairedFor = (pairings: Map<number, number[]>, c: Candidate) =>
    pairings.get(c.categoryId) ?? pairings.get(c.rootCategoryId) ?? [];

export const recommendationsHandlers = {
    /** Product page: "Complete the look" and "You may also like", never overlapping. */
    forProduct: async (c: AppContext) => {
        const id = productIdParam(c);
        const candidates = await q.candidates();
        const target = candidates.find((p) => p.id === id);
        if (!target) throw new NotFoundError('Product', id);
        const [picks, pairings, together] = await Promise.all([q.staffPicks([id]), q.categoryPairings(), q.boughtTogether([id])]);

        const complements = recommendComplements(target, candidates, {
            staffPicks: picks.get(id), pairedCategoryIds: pairedFor(pairings, target), together: together.get(id),
        });
        const similar = recommendSimilar(target, candidates, together.get(id), { exclude: new Set(complements.map((p) => p.id)) });
        const [completeCards, similarCards] = await Promise.all([toCards(complements), toCards(similar)]);
        const response: ProductRecommendationsResponse = { similar: similarCards, complete_the_look: completeCards };
        return success(c, response);
    },

    /** Bag page: what goes with what's in the bag. */
    forBag: async (c: AppContext) => {
        const { product_ids } = parse(c.req.query(), bagQuerySchema);
        const candidates = await q.candidates();
        const inBag = new Set(product_ids);
        const bag = candidates.filter((p) => inBag.has(p.id));
        const ids = bag.map((p) => p.id);
        const [picks, pairings, together] = await Promise.all([q.staffPicks(ids), q.categoryPairings(), q.boughtTogether(ids)]);
        const result = recommendForBag(bag, candidates.filter((p) => !inBag.has(p.id)), {
            staffPicks: picks, pairedCategoryIds: pairings, together,
        });
        const response: RecommendedProductsResponse = { products: await toCards(result) };
        return success(c, response);
    },

    /** Recently viewed: the ids come from the visitor's own browser; only active products come back. */
    viewed: async (c: AppContext) => {
        const { product_ids } = parse(c.req.query(), viewedQuerySchema);
        const rows = await q.listingByIds(product_ids);
        const response: RecommendedProductsResponse = { products: (await attachImages(rows)).map(toProductResponse) };
        return success(c, response);
    },

    event: async (c: AppContext) => {
        const { rail, event } = parse(await c.req.json().catch(() => null), eventSchema);
        await q.recordEvent(rail as RecommendationRail, event);
        return c.body(null, 204);
    },

    // ── Admin ────────────────────────────────────────────────────────────────

    stats: async (c: AppContext) => {
        const { days } = parse(c.req.query(), statsQuerySchema);
        const rows = await q.stats(days);
        const byRail = new Map(rows.map((r) => [r.rail, r]));
        const response: RecommendationStatsResponse = {
            days,
            rails: Object.values(RECOMMENDATION_RAIL).map((rail) => ({
                rail,
                impressions: Number(byRail.get(rail)?.impressions ?? 0),
                clicks: Number(byRail.get(rail)?.clicks ?? 0),
            })),
        };
        return success(c, response);
    },

    productPairings: async (c: AppContext) => {
        const id = productIdParam(c);
        const response: ProductPairingsResponse = { product_id: String(id), pairings: (await q.pairedProducts(id)).map(toPairedSummary) };
        return success(c, response);
    },

    setProductPairings: async (c: AppContext) => {
        const id = productIdParam(c);
        const { product_ids } = parse(await c.req.json().catch(() => null), productPairingsSchema);
        const ids = [...new Set(product_ids)];
        if (ids.includes(id)) throw new BadRequestError('A product can’t go with itself');
        const existing = await q.existingProductIds([id, ...ids]);
        if (!existing.has(id)) throw new NotFoundError('Product', id);
        const missing = ids.filter((p) => !existing.has(p));
        if (missing.length) throw new BadRequestError(`Product not found: ${missing.join(', ')}`);
        const before = (await q.pairedProducts(id)).map((p) => Number(p.id));
        await q.setPairedProducts(id, ids);
        await auditFromContext(c, { action: 'PRODUCT_PAIRINGS_UPDATED', entityType: 'product', entityId: id, before: { product_ids: before }, after: { product_ids: ids } });
        const response: ProductPairingsResponse = { product_id: String(id), pairings: (await q.pairedProducts(id)).map(toPairedSummary) };
        return success(c, response, 'Pairings saved');
    },

    categoryPairings: async (c: AppContext) => success(c, await categoryPairingsResponse()),

    setCategoryPairings: async (c: AppContext) => {
        const { category_id, paired_category_ids } = parse(await c.req.json().catch(() => null), categoryPairingsSchema);
        const ids = [...new Set(paired_category_ids)];
        const topLevel = await q.topLevelCategoryIds();
        if (!topLevel.has(category_id)) throw new BadRequestError('Pairings are set on top-level categories');
        if (ids.includes(category_id)) throw new BadRequestError('A category can’t go with itself');
        if (ids.some((p) => !topLevel.has(p))) throw new BadRequestError('Choose top-level categories only');
        const before = (await q.categoryPairings()).get(category_id) ?? [];
        await q.setCategoryPairings(category_id, ids);
        await auditFromContext(c, { action: 'CATEGORY_PAIRINGS_UPDATED', entityType: 'category', entityId: category_id, before: { paired: before }, after: { paired: ids } });
        return success(c, await categoryPairingsResponse(), 'Pairings saved');
    },
};

function toPairedSummary(p: { id: number; name: string; image_url: string | null; is_active: boolean; in_stock: boolean }) {
    return { id: String(p.id), name: p.name, image_url: p.image_url ?? '', is_active: Boolean(p.is_active), in_stock: Boolean(p.in_stock) };
}

async function categoryPairingsResponse(): Promise<CategoryPairingsResponse> {
    const map = await q.categoryPairings();
    return { pairings: [...map.entries()].map(([category_id, paired]) => ({ category_id: String(category_id), paired_category_ids: paired.map(String) })) };
}
