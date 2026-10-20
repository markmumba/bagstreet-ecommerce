/**
 * Product review rules (CONTEXT.md › Product review). Pure: who may review, what is shown publicly,
 * and how ratings are summarised. Storage and moderation live in reviews.queries.ts.
 */

/** Reviews are by verified buyers: an order of goods the customer has received. */
export function canReviewOrder(order: { status: string; order_source: string }): { ok: true } | { ok: false; reason: string } {
    if (order.order_source === 'GIFT_VOUCHER') return { ok: false, reason: 'Gift voucher purchases can’t be reviewed' };
    if (order.status !== 'DELIVERED') return { ok: false, reason: 'You can review this order once it has been received' };
    return { ok: true };
}

/** First name and last initial ("Amani W."). Never an email address or phone number. */
export function publicAuthorName(fullName: string | null | undefined): string {
    const name = (fullName ?? '').trim();
    if (!name || name.includes('@') || /\d{4,}/.test(name)) return 'Verified buyer';
    const parts = name.split(/\s+/).filter(Boolean);
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    if (parts.length === 1) return cap(parts[0]!);
    return `${cap(parts[0]!)} ${parts[parts.length - 1]!.charAt(0).toUpperCase()}.`;
}

/** What was bought, e.g. "M / Navy" or "Brown". */
export function variantLabel(size: string | null | undefined, color: string | null | undefined): string | null {
    const label = [size, color].map((v) => v?.trim()).filter(Boolean).join(' / ');
    return label || null;
}

export interface RatingSummary {
    /** Rounded to one decimal; null with no reviews. */
    average: number | null;
    count: number;
    distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export function summariseRatings(ratings: number[]): RatingSummary {
    const distribution: RatingSummary['distribution'] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const rating of ratings) distribution[rating as 1 | 2 | 3 | 4 | 5] += 1;
    const count = ratings.length;
    const average = count ? Math.round((ratings.reduce((a, b) => a + b, 0) / count) * 10) / 10 : null;
    return { average, count, distribution };
}

/** Shop listing cards show stars only once there are enough reviews to mean something. */
export const MIN_REVIEWS_FOR_CARD_STARS = 3;
/** The review invitation goes out this long after an order is received. */
export const REVIEW_INVITE_DELAY_DAYS = 5;
