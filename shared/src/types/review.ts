/** Product reviews (CONTEXT.md › Product review): verified buyers, approved by staff before they show. */

export const REVIEW_STATUS = {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
} as const;
export type ReviewStatus = typeof REVIEW_STATUS[keyof typeof REVIEW_STATUS];

export interface ReviewSummaryResponse {
    /** Rounded to one decimal; null with no approved reviews. */
    average: number | null;
    count: number;
    /** How many reviews gave each star rating. */
    distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}

/** An approved review as shown on the storefront. */
export interface PublicReviewResponse {
    id: string;
    rating: number;
    title: string | null;
    body: string;
    /** First name and last initial, e.g. "Amani W.". */
    author_name: string;
    /** What they bought, e.g. "Brown". */
    variant_label: string | null;
    created_at: string;
    reply: { body: string; created_at: string } | null;
}

export interface ProductReviewsResponse {
    summary: ReviewSummaryResponse;
    reviews: PublicReviewResponse[];
    page: number;
    limit: number;
    total: number;
}

/** One product in an order, with the customer's review of it if they've written one. */
export interface OrderReviewItem {
    product_id: string;
    product_name: string;
    product_slug: string | null;
    image_url: string | null;
    variant_label: string | null;
    review: {
        id: string;
        rating: number;
        title: string | null;
        body: string;
        status: ReviewStatus;
        reject_reason: string | null;
        updated_at: string;
    } | null;
}

export interface OrderReviewsResponse {
    order_number: string;
    can_review: boolean;
    /** Why the order can't be reviewed yet, when it can't. */
    reason: string | null;
    items: OrderReviewItem[];
}

/** Writing or editing a review. Guests prove the order is theirs with the emailed link's token. */
export interface ReviewUpsertRequest {
    order_ref: string;
    token?: string;
    rating: number;
    title?: string;
    body: string;
}

export interface AdminReviewResponse {
    id: string;
    product_id: string;
    product_name: string;
    product_slug: string | null;
    order_id: string;
    order_number: string;
    author_name: string;
    variant_label: string | null;
    rating: number;
    title: string | null;
    body: string;
    status: ReviewStatus;
    reject_reason: string | null;
    reply_body: string | null;
    replied_at: string | null;
    moderated_by_email: string | null;
    moderated_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface ReviewCountsResponse {
    pending: number;
    approved: number;
    rejected: number;
}
