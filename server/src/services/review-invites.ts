/**
 * Review invitations (CONTEXT.md › Product review): one email per received order, 5 days after it
 * was received, with a signed link to review what was bought. Runs hourly; each order is invited
 * once (the send is marked in the same transaction that queues the email).
 */
import { sql } from '../lib/db';
import { env } from '../config/env';
import { createOrderReviewToken, orderTokenRef } from '../lib/order-received-token';
import { reviewsQueries } from '../features/reviews/reviews.queries';
import { REVIEW_INVITE_DELAY_DAYS } from '../features/reviews/review-rules';
import { enqueueEmail, wakeEmailOutbox } from './email-outbox';

/** The storefront page a customer reviews an order on. */
export function reviewPageUrl(order: { id: number | string; public_id?: string | null }): string {
    const ref = orderTokenRef(order);
    const url = new URL('/orders/review', env.STOREFRONT_URL);
    url.searchParams.set('order_id', ref);
    url.searchParams.set('token', createOrderReviewToken(ref));
    return url.toString();
}

export async function sendDueReviewInvites(): Promise<number> {
    const candidates = await reviewsQueries.inviteCandidates(REVIEW_INVITE_DELAY_DAYS);
    let queued = 0;
    for (const order of candidates) {
        const products = await reviewsQueries.orderProducts(Number(order.id));
        await sql.begin(async (tx) => {
            const [claimed] = await tx`
                UPDATE orders SET review_invite_sent_at = CURRENT_TIMESTAMP
                WHERE id = ${order.id} AND review_invite_sent_at IS NULL
                RETURNING id
            `;
            if (!claimed) return;
            const sent = await enqueueEmail({
                type: 'REVIEW_INVITE',
                to: order.customer_email,
                name: order.customer_name?.trim().split(/\s+/)[0] || 'there',
                orderRef: order.order_number,
                productNames: products.map((p) => p.product_name),
                reviewUrl: reviewPageUrl(order),
            }, { tx, dedupeKey: `review-invite:${order.id}` });
            if (sent) queued += 1;
        });
    }
    if (queued) wakeEmailOutbox();
    return queued;
}

let started = false;
let running = false;
export function startReviewInvites() {
    if (started) return;
    started = true;
    const tick = async () => {
        if (running) return;
        running = true;
        try { await sendDueReviewInvites(); }
        catch (error) { console.error('[review-invites] failed:', error); }
        finally { running = false; }
    };
    setInterval(() => void tick(), 60 * 60_000);
    setTimeout(() => void tick(), 60_000);
}
