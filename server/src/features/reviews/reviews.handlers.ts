import type {
    AdminReviewResponse, OrderReviewsResponse, ProductReviewsResponse, PublicReviewResponse, ReviewCountsResponse,
} from 'shared/dist';
import type { AppContext } from '@server/lib/hono';
import { getOptionalUser, getRequiredUser } from '@server/lib/hono';
import { auditFromContext } from '@server/lib/audit';
import { BadRequestError, ForbiddenError, NotFoundError, ValidationError } from '@server/lib/errors';
import { paginated, success } from '@server/lib/response';
import { orderTokenRef, verifyOrderReceivedToken, verifyOrderReviewToken } from '@server/lib/order-received-token';
import { ordersQueries, type OrderRow } from '../orders/orders.queries';
import { alertStaff } from '../staff-alerts/staff-alerts';
import { canReviewOrder, publicAuthorName } from './review-rules';
import { reviewsQueries, type AdminReviewRow, type ReviewRow } from './reviews.queries';
import {
    adminListSchema, orderAccessSchema, productReviewsQuerySchema, rejectSchema, replySchema, upsertReviewSchema,
} from './reviews.schema';

const iso = (v: string | Date | null) => (v ? new Date(v).toISOString() : null);

function toPublic(row: ReviewRow): PublicReviewResponse {
    return {
        id: String(row.id),
        rating: Number(row.rating),
        title: row.title,
        body: row.body,
        author_name: row.author_name,
        variant_label: row.variant_label,
        created_at: iso(row.created_at)!,
        reply: row.reply_body ? { body: row.reply_body, created_at: iso(row.replied_at)! } : null,
    };
}

function toAdmin(row: AdminReviewRow): AdminReviewResponse {
    return {
        id: String(row.id),
        product_id: String(row.product_id),
        product_name: row.product_name,
        product_slug: row.product_slug,
        order_id: String(row.order_id),
        order_number: row.order_number,
        author_name: row.author_name,
        variant_label: row.variant_label,
        rating: Number(row.rating),
        title: row.title,
        body: row.body,
        status: row.status,
        reject_reason: row.reject_reason,
        reply_body: row.reply_body,
        replied_at: iso(row.replied_at),
        moderated_by_email: row.moderated_by_email,
        moderated_at: iso(row.moderated_at),
        created_at: iso(row.created_at)!,
        updated_at: iso(row.updated_at)!,
    };
}

async function parse<T>(input: unknown, schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { errors: any } } }) {
    const result = schema.safeParse(input);
    if (!result.success) throw new ValidationError(result.error.errors?.[0]?.message ?? 'Check the review and try again', result.error.errors);
    return result.data;
}

/**
 * The order a review is for. The customer proves it is theirs with the emailed review link (or the
 * "received" link from the confirmation email), or by being signed in as the order's owner.
 */
async function ownedOrder(c: AppContext, orderRef: string, token: string | undefined): Promise<OrderRow> {
    const order = await ordersQueries.findByReference(orderRef);
    if (!order) throw new NotFoundError('Order', orderRef);
    const ref = orderTokenRef(order as any);
    const user = getOptionalUser(c);
    const isOwner = user != null && order.user_id != null && Number(order.user_id) === Number(user.sub);
    if (!isOwner && !verifyOrderReviewToken(ref, token) && !verifyOrderReceivedToken(ref, token)) {
        throw new ForbiddenError('This review link has expired or isn’t for your order. Sign in to review from your orders.');
    }
    return order;
}

const productId = (c: AppContext) => {
    const id = Number(c.req.param('productId'));
    if (!Number.isInteger(id) || id <= 0) throw new NotFoundError('Product', c.req.param('productId') ?? '');
    return id;
};

export const reviewsHandlers = {
    /** Approved reviews and the rating summary for a product page. */
    forProduct: async (c: AppContext) => {
        const { page, limit } = await parse(c.req.query(), productReviewsQuerySchema);
        const { rows, summary } = await reviewsQueries.approvedForProduct(productId(c), page, limit);
        const response: ProductReviewsResponse = {
            summary: {
                average: summary.average,
                count: summary.count,
                distribution: { 1: summary.distribution[1], 2: summary.distribution[2], 3: summary.distribution[3], 4: summary.distribution[4], 5: summary.distribution[5] },
            },
            reviews: rows.map(toPublic),
            page,
            limit,
            total: summary.count,
        };
        return success(c, response);
    },

    /** What the customer can review in an order, and what they've already written. */
    forOrder: async (c: AppContext) => {
        const { order_ref, token } = await parse(c.req.query(), orderAccessSchema);
        const order = await ownedOrder(c, order_ref, token);
        const eligibility = canReviewOrder(order as any);
        const [products, reviews] = await Promise.all([reviewsQueries.orderProducts(Number(order.id)), reviewsQueries.forOrder(Number(order.id))]);
        const byProduct = new Map(reviews.map((r) => [Number(r.product_id), r]));
        const response: OrderReviewsResponse = {
            order_number: order.order_number,
            can_review: eligibility.ok,
            reason: eligibility.ok ? null : eligibility.reason,
            items: products.map((p) => {
                const review = byProduct.get(p.product_id);
                return {
                    product_id: String(p.product_id),
                    product_name: p.product_name,
                    product_slug: p.product_slug,
                    image_url: p.image_url,
                    variant_label: p.variant_label,
                    review: review ? {
                        id: String(review.id), rating: Number(review.rating), title: review.title, body: review.body,
                        status: review.status, reject_reason: review.reject_reason, updated_at: iso(review.updated_at)!,
                    } : null,
                };
            }),
        };
        return success(c, response);
    },

    /** Writes or edits the customer's review of one product; it waits for staff approval. */
    upsert: async (c: AppContext) => {
        const data = await parse(await c.req.json().catch(() => null), upsertReviewSchema);
        const order = await ownedOrder(c, data.order_ref, data.token);
        const eligibility = canReviewOrder(order as any);
        if (!eligibility.ok) throw new BadRequestError(eligibility.reason);
        const id = productId(c);
        const product = (await reviewsQueries.orderProducts(Number(order.id))).find((p) => p.product_id === id);
        if (!product) throw new BadRequestError('That product isn’t in this order');

        const customerName = (order as any).customer_name ?? (order as any).shipping_address?.full_name ?? null;
        const review = await reviewsQueries.upsert({
            orderId: Number(order.id),
            productId: id,
            userId: order.user_id != null ? Number(order.user_id) : null,
            authorName: publicAuthorName(customerName),
            variantLabel: product.variant_label,
            rating: data.rating,
            title: data.title,
            body: data.body,
        });
        // Staff see new and edited reviews in their notifications (admins, in-app only).
        await alertStaff({
            audience: 'system',
            type: 'REVIEW_PENDING',
            title: `New review to check: ${product.product_name}`,
            body: `${'★'.repeat(data.rating)}${'☆'.repeat(5 - data.rating)} from ${review.author_name}`,
            link: '/reviews',
            data: { review_id: String(review.id) },
            dedupeKey: `review-pending:${review.id}:${new Date(review.updated_at).getTime()}`,
        }).catch((err) => console.error('[reviews] staff alert failed:', err));
        return success(c, { id: String(review.id), status: review.status }, 'Thanks! Your review will appear once we’ve checked it.', 201);
    },

    remove: async (c: AppContext) => {
        const { order_ref, token } = await parse(await c.req.json().catch(() => null), orderAccessSchema);
        const order = await ownedOrder(c, order_ref, token);
        const removed = await reviewsQueries.remove(Number(order.id), productId(c));
        if (!removed) throw new NotFoundError('Review', c.req.param('productId') ?? '');
        return success(c, null, 'Your review has been deleted');
    },

    adminList: async (c: AppContext) => {
        const { status, page, limit } = await parse(c.req.query(), adminListSchema);
        const { rows, total } = await reviewsQueries.adminList(status ?? null, page, limit);
        return paginated(c, rows.map(toAdmin), page, limit, total);
    },

    adminCounts: async (c: AppContext) => {
        const response: ReviewCountsResponse = await reviewsQueries.counts();
        return success(c, response);
    },

    approve: async (c: AppContext) => moderate(c, 'APPROVED'),
    reject: async (c: AppContext) => moderate(c, 'REJECTED'),

    reply: async (c: AppContext) => {
        const id = reviewId(c);
        const { body } = await parse(await c.req.json().catch(() => null), replySchema);
        const updated = await reviewsQueries.reply(id, body || null, Number(getRequiredUser(c).sub));
        if (!updated) throw new NotFoundError('Review', id);
        await auditFromContext(c, { action: body ? 'REVIEW_REPLIED' : 'REVIEW_REPLY_REMOVED', entityType: 'product_review', entityId: id });
        return success(c, toPublic(updated), body ? 'Reply published' : 'Reply removed');
    },
};

function reviewId(c: AppContext) {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) throw new NotFoundError('Review', c.req.param('id') ?? '');
    return id;
}

async function moderate(c: AppContext, status: 'APPROVED' | 'REJECTED') {
    const id = reviewId(c);
    const reason = status === 'REJECTED' ? (await parse(await c.req.json().catch(() => null), rejectSchema)).reason : null;
    const before = await reviewsQueries.findById(id);
    if (!before) throw new NotFoundError('Review', id);
    const updated = await reviewsQueries.moderate(id, status, reason, Number(getRequiredUser(c).sub));
    await auditFromContext(c, {
        action: status === 'APPROVED' ? 'REVIEW_APPROVED' : 'REVIEW_REJECTED',
        entityType: 'product_review',
        entityId: id,
        before: { status: before.status },
        after: { status, reason },
    });
    return success(c, toPublic(updated!), status === 'APPROVED' ? 'Review published' : 'Review rejected');
}
