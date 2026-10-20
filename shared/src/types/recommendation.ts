import type { ProductResponse } from './product';

/** The places recommendations are shown; used to count how often they're seen and clicked. */
export const RECOMMENDATION_RAIL = {
    SIMILAR: 'similar',
    COMPLETE_THE_LOOK: 'complete_the_look',
    BAG: 'bag',
    RECENTLY_VIEWED: 'recently_viewed',
} as const;
export type RecommendationRail = (typeof RECOMMENDATION_RAIL)[keyof typeof RECOMMENDATION_RAIL];

/** GET /api/recommendations/products/:id */
export interface ProductRecommendationsResponse {
    /** "You may also like": same category family, similar price. */
    similar: ProductResponse[];
    /** "Complete the look": staff picks, then categories that go with this one. */
    complete_the_look: ProductResponse[];
}

/** GET /api/recommendations/bag and /viewed */
export interface RecommendedProductsResponse {
    products: ProductResponse[];
}

/** POST /api/recommendations/events — counted per day and rail only, nothing about the visitor. */
export interface RecommendationEventRequest {
    rail: RecommendationRail;
    event: 'impression' | 'click';
}

export interface RecommendationRailStats {
    rail: RecommendationRail;
    impressions: number;
    clicks: number;
}

/** GET /api/recommendations/stats?days=30 */
export interface RecommendationStatsResponse {
    days: number;
    rails: RecommendationRailStats[];
}

export interface PairedProductSummary {
    id: string;
    name: string;
    image_url: string;
    is_active: boolean;
    in_stock: boolean;
}

/** GET/PUT /api/recommendations/admin/products/:id/pairings — "Goes well with" (max 4). */
export interface ProductPairingsResponse {
    product_id: string;
    pairings: PairedProductSummary[];
}

export interface ProductPairingsRequest {
    product_ids: string[];
}

/** GET/PUT /api/recommendations/admin/categories/pairings — top-level categories that go together. */
export interface CategoryPairingsResponse {
    pairings: { category_id: string; paired_category_ids: string[] }[];
}

export interface CategoryPairingsRequest {
    category_id: string;
    paired_category_ids: string[];
}
