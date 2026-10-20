import type { ReviewStatus } from 'shared/dist';
import { sql } from '../../lib/db';
import { summariseRatings, variantLabel, type RatingSummary } from './review-rules';

type Executor = typeof sql;

export interface ReviewRow {
    id: number;
    product_id: number;
    order_id: number;
    user_id: number | null;
    author_name: string;
    variant_label: string | null;
    rating: number;
    title: string | null;
    body: string;
    status: ReviewStatus;
    reject_reason: string | null;
    moderated_by: number | null;
    moderated_at: string | null;
    reply_body: string | null;
    replied_by: number | null;
    replied_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface AdminReviewRow extends ReviewRow {
    product_name: string;
    product_slug: string | null;
    order_number: string;
    moderated_by_email: string | null;
}

export interface OrderProductRow {
    product_id: number;
    product_name: string;
    product_slug: string | null;
    image_url: string | null;
    variant_size: string | null;
    variant_color: string | null;
}

export const reviewsQueries = {
    /** Approved reviews of a product, newest first. */
    approvedForProduct: async (productId: number, page: number, limit: number) => {
        const offset = (page - 1) * limit;
        const rows = await sql<ReviewRow[]>`
            SELECT * FROM product_reviews
            WHERE product_id = ${productId} AND status = 'APPROVED'
            ORDER BY created_at DESC, id DESC
            LIMIT ${limit} OFFSET ${offset}
        `;
        const ratings = await sql<{ rating: number }[]>`
            SELECT rating FROM product_reviews WHERE product_id = ${productId} AND status = 'APPROVED'
        `;
        return { rows, summary: summariseRatings(ratings.map((r) => Number(r.rating))) };
    },

    /** Average and count of approved reviews for many products at once (for listings). */
    summaries: async (productIds: number[]): Promise<Map<number, Pick<RatingSummary, 'average' | 'count'>>> => {
        const result = new Map<number, Pick<RatingSummary, 'average' | 'count'>>();
        if (productIds.length === 0) return result;
        const rows = await sql<{ product_id: number; average: string; count: number }[]>`
            SELECT product_id, ROUND(AVG(rating)::numeric, 1) AS average, COUNT(*)::int AS count
            FROM product_reviews
            WHERE status = 'APPROVED' AND product_id IN ${sql(productIds)}
            GROUP BY product_id
        `;
        for (const row of rows) result.set(Number(row.product_id), { average: Number(row.average), count: Number(row.count) });
        return result;
    },

    /** The distinct products in an order (with one variant label each) for the review page. */
    orderProducts: async (orderId: number): Promise<(OrderProductRow & { variant_label: string | null })[]> => {
        const rows = await sql<OrderProductRow[]>`
            SELECT DISTINCT ON (oi.product_id)
                oi.product_id, p.name AS product_name, p.slug AS product_slug, p.image_url,
                oi.variant_size, oi.variant_color
            FROM order_items oi JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = ${orderId}
            ORDER BY oi.product_id, oi.id
        `;
        return rows.map((r) => ({ ...r, product_id: Number(r.product_id), variant_label: variantLabel(r.variant_size, r.variant_color) }));
    },

    forOrder: async (orderId: number): Promise<ReviewRow[]> => {
        return await sql<ReviewRow[]>`SELECT * FROM product_reviews WHERE order_id = ${orderId}`;
    },

    /**
     * Writes the customer's review of one product in their order. Editing sends it back for
     * approval, so what's public has always been checked by staff.
     */
    upsert: async (data: {
        orderId: number; productId: number; userId: number | null; authorName: string; variantLabel: string | null;
        rating: number; title: string | null; body: string;
    }): Promise<ReviewRow> => {
        const [row] = await sql<ReviewRow[]>`
            INSERT INTO product_reviews (product_id, order_id, user_id, author_name, variant_label, rating, title, body)
            VALUES (${data.productId}, ${data.orderId}, ${data.userId}, ${data.authorName}, ${data.variantLabel},
                    ${data.rating}, ${data.title}, ${data.body})
            ON CONFLICT (order_id, product_id) DO UPDATE SET
                rating = EXCLUDED.rating, title = EXCLUDED.title, body = EXCLUDED.body,
                status = 'PENDING', reject_reason = NULL, moderated_by = NULL, moderated_at = NULL,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `;
        return row!;
    },

    remove: async (orderId: number, productId: number): Promise<boolean> => {
        const rows = await sql`DELETE FROM product_reviews WHERE order_id = ${orderId} AND product_id = ${productId} RETURNING id`;
        return rows.length > 0;
    },

    adminList: async (status: ReviewStatus | null, page: number, limit: number) => {
        const offset = (page - 1) * limit;
        const rows = await sql<AdminReviewRow[]>`
            SELECT r.*, p.name AS product_name, p.slug AS product_slug, o.order_number, u.email AS moderated_by_email
            FROM product_reviews r
            JOIN products p ON p.id = r.product_id
            JOIN orders o ON o.id = r.order_id
            LEFT JOIN users u ON u.id = r.moderated_by
            WHERE (${status}::text IS NULL OR r.status = ${status}::text)
            -- Oldest pending first (a queue); otherwise newest first.
            ORDER BY CASE WHEN ${status}::text = 'PENDING' THEN r.updated_at END ASC, r.updated_at DESC, r.id DESC
            LIMIT ${limit} OFFSET ${offset}
        `;
        const [count] = await sql<{ total: number }[]>`
            SELECT COUNT(*)::int AS total FROM product_reviews WHERE (${status}::text IS NULL OR status = ${status}::text)
        `;
        return { rows, total: Number(count?.total ?? 0) };
    },

    counts: async () => {
        const [row] = await sql<{ pending: number; approved: number; rejected: number }[]>`
            SELECT COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
                   COUNT(*) FILTER (WHERE status = 'APPROVED')::int AS approved,
                   COUNT(*) FILTER (WHERE status = 'REJECTED')::int AS rejected
            FROM product_reviews
        `;
        return { pending: Number(row?.pending ?? 0), approved: Number(row?.approved ?? 0), rejected: Number(row?.rejected ?? 0) };
    },

    findById: async (id: number, db: Executor = sql): Promise<ReviewRow | undefined> => {
        const [row] = await db<ReviewRow[]>`SELECT * FROM product_reviews WHERE id = ${id}`;
        return row;
    },

    moderate: async (id: number, status: 'APPROVED' | 'REJECTED', reason: string | null, by: number): Promise<ReviewRow | undefined> => {
        const [row] = await sql<ReviewRow[]>`
            UPDATE product_reviews
            SET status = ${status}, reject_reason = ${status === 'REJECTED' ? reason : null},
                moderated_by = ${by}, moderated_at = CURRENT_TIMESTAMP
            WHERE id = ${id}
            RETURNING *
        `;
        return row;
    },

    /** One public reply per review; an empty body removes it. */
    reply: async (id: number, body: string | null, by: number): Promise<ReviewRow | undefined> => {
        const [row] = await sql<ReviewRow[]>`
            UPDATE product_reviews
            SET reply_body = ${body}, replied_by = ${body ? by : null}, replied_at = ${body ? new Date().toISOString() : null}
            WHERE id = ${id}
            RETURNING *
        `;
        return row;
    },

    /** Received orders due a review invitation: 5–30 days after delivery, never sent, with an email. */
    inviteCandidates: async (delayDays: number, limit = 50) => {
        return await sql<{ id: number; public_id: string; order_number: string; customer_name: string | null; customer_email: string }[]>`
            SELECT o.id, o.public_id, o.order_number, o.customer_name, o.customer_email
            FROM orders o
            WHERE o.status = 'DELIVERED'
              AND o.order_source <> 'GIFT_VOUCHER'
              AND o.review_invite_sent_at IS NULL
              AND o.customer_email IS NOT NULL AND o.customer_email <> ''
              AND o.delivered_at <= now() - make_interval(days => ${delayDays})
              -- Never invite for old orders (e.g. when this feature first ships).
              AND o.delivered_at > now() - interval '30 days'
              AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id)
              -- Respect anyone who has asked not to get our emails.
              AND NOT EXISTS (SELECT 1 FROM email_preferences ep WHERE lower(ep.email) = lower(o.customer_email) AND ep.unsubscribed_at IS NOT NULL)
            ORDER BY o.delivered_at
            LIMIT ${limit}
        `;
    },
};
