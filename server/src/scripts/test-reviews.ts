/**
 * Product review checks against the dev database, through the real review routes: who may review,
 * edits going back to approval, moderation, replies, ratings on listings, invitations sent once,
 * and account erasure. Creates its own product, customer and orders and deletes them afterwards.
 * No email can reach anyone: every invitation key is reserved as an already-skipped test row first.
 *
 *   bun run test:reviews
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { sql, closeDatabase } from '../lib/db';
import { env } from '../config/env';
import type { AppEnv, AuthUser } from '../lib/hono';
import { errorHandler } from '../middleware/error-handler';
import reviewsRoutes from '../features/reviews/reviews.routes';
import { reviewsQueries } from '../features/reviews/reviews.queries';
import { REVIEW_INVITE_DELAY_DAYS } from '../features/reviews/review-rules';
import { sendDueReviewInvites } from '../services/review-invites';
import { createOrderReceivedToken, createOrderReviewToken, createOrderAccessToken } from '../lib/order-received-token';
import { createPrivacyRequest, eraseCustomerAccount } from '../features/compliance/compliance.queries';
import { toJsonbParam } from '../lib/json-column';

if (env.NODE_ENV === 'production') throw new Error('Review fixtures must not run in production');

const results: [string, boolean, string?][] = [];
const check = (name: string, ok: boolean, detail?: string) => results.push([name, ok, detail]);

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route('/api/reviews', reviewsRoutes);

const tag = randomUUID().slice(0, 8);
const userIds: number[] = [];
const orderIds: number[] = [];
const guardKeys: string[] = [];
// Real dev orders the invitation run claims; given back afterwards so they are still invited for real.
const borrowedOrderIds: number[] = [];
let categoryId = 0, productId = 0, otherProductId = 0;

const accessToken = async (id: number, email: string, role: string) => {
    const now = Math.floor(Date.now() / 1000);
    return sign({ sub: String(id), email, role, iat: now, exp: now + 600 }, env.JWT_SECRET, 'HS256');
};
const call = async (method: string, path: string, body?: unknown, bearer?: string) => {
    const response = await app.request(`/api/reviews${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await response.json().catch(() => null) as any;
    return { status: response.status, data: json?.data, message: json?.message as string | undefined };
};
const guard = async (key: string) => {
    guardKeys.push(key);
    await sql`INSERT INTO email_outbox (job_type, recipient, payload, dedupe_key, status, sent_at)
              VALUES ('ZZ_TEST', 'zz-outbox-guard@example.invalid', '{}'::jsonb, ${key}, 'SKIPPED', now()) ON CONFLICT DO NOTHING`;
};
const makeOrder = async (o: { userId: number | null; status: string; source?: string; deliveredDaysAgo?: number | null; email?: string | null; products?: number[] }) => {
    const [order] = await sql`
        INSERT INTO orders(user_id, order_number, total_amount, shipping_address, customer_email, customer_name, customer_phone,
                           status, payment_status, order_source, delivered_at)
        VALUES (${o.userId}, ${`ZZR-${tag}-${orderIds.length}`}, 1000,
                ${toJsonbParam({ full_name: 'Amani Wanjiru', address_line1: 'x', city: 'x' })}::jsonb,
                ${o.email === undefined ? `zz-review-${tag}@example.invalid` : o.email}, 'Amani Wanjiru', '254700000000',
                ${o.status}, 'PAID', ${o.source ?? 'ONLINE'},
                ${o.deliveredDaysAgo == null ? null : new Date(Date.now() - o.deliveredDaysAgo * 86_400_000).toISOString()})
        RETURNING id, public_id
    `;
    const id = Number(order.id);
    orderIds.push(id);
    await guard(`review-invite:${id}`);
    for (const p of o.products ?? [productId]) {
        const [v] = await sql`SELECT id, sku FROM product_variants WHERE product_id = ${p} LIMIT 1`;
        await sql`INSERT INTO order_items(order_id, product_id, variant_id, variant_sku, variant_size, variant_color, quantity, unit_price, subtotal)
                  VALUES (${id}, ${p}, ${v.id}, ${v.sku}, 'M', 'Navy', 1, 1000, 1000)`;
    }
    return { id, ref: String(order.public_id) };
};
const review = (ref: string, token: string | undefined, rating: number, body: string, title?: string) =>
    ({ order_ref: ref, token, rating, body, title });

try {
    const [cat] = await sql`INSERT INTO categories(name, slug, description) VALUES (${`ZZ Review ${tag}`}, ${`zz-review-${tag}`}, '') RETURNING id`;
    categoryId = Number(cat.id);
    for (const n of [1, 2]) {
        const [p] = await sql`INSERT INTO products(category_id, sku, name, slug, description, price, stock, image_url, is_active)
            VALUES (${categoryId}, ${`ZZ-RV-${tag}-${n}`}, ${`ZZ Review Product ${n}`}, ${`zz-review-product-${tag}-${n}`}, '', 1000, 0, '', true) RETURNING id`;
        await sql`INSERT INTO product_variants(product_id, sku, size, color, stock, is_active) VALUES (${p.id}, ${`ZZ-RV-${tag}-${n}-V`}, 'M', 'Navy', 10, true)`;
        if (n === 1) productId = Number(p.id); else otherProductId = Number(p.id);
    }
    const customerEmail = `zz-review-${tag}@example.invalid`;
    const [customer] = await sql`INSERT INTO users(email, full_name, password_hash, role, is_active)
        VALUES (${customerEmail}, 'Amani Wanjiru', 'not-a-login', 'CUSTOMER', true) RETURNING id`;
    const [admin] = await sql`INSERT INTO users(email, full_name, password_hash, role, is_active)
        VALUES (${`zz-review-admin-${tag}@example.invalid`}, 'ZZ Review Admin', 'not-a-login', 'ADMIN', true) RETURNING id, email`;
    const CUSTOMER = Number(customer.id), ADMIN = Number(admin.id);
    userIds.push(CUSTOMER, ADMIN);
    const customerJwt = await accessToken(CUSTOMER, customerEmail, 'CUSTOMER');
    const adminJwt = await accessToken(ADMIN, admin.email, 'ADMIN');

    const received = await makeOrder({ userId: CUSTOMER, status: 'DELIVERED', deliveredDaysAgo: 6, products: [productId, otherProductId] });
    const notYet = await makeOrder({ userId: null, status: 'CONFIRMED' });
    const voucherSale = await makeOrder({ userId: null, status: 'DELIVERED', source: 'GIFT_VOUCHER', deliveredDaysAgo: 6, products: [] });
    const guest = await makeOrder({ userId: null, status: 'DELIVERED', deliveredDaysAgo: 2 });

    // 1. Who may review.
    const reviewToken = createOrderReviewToken(received.ref);
    const page = await call('GET', `/order?order_ref=${received.ref}&token=${reviewToken}`);
    check('the review link opens the order with both products to review',
        page.status === 200 && page.data.can_review === true && page.data.items.length === 2 && page.data.items[0].variant_label === 'M / Navy', JSON.stringify(page.data));
    const signedIn = await call('GET', `/order?order_ref=${received.ref}`, undefined, customerJwt);
    check('the signed-in owner needs no link', signedIn.status === 200 && signedIn.data.can_review === true);
    const viaReceived = await call('GET', `/order?order_ref=${received.ref}&token=${createOrderReceivedToken(received.ref)}`);
    check('the "received" link from the confirmation email also works', viaReceived.status === 200);
    const wrongOrder = await call('GET', `/order?order_ref=${received.ref}&token=${createOrderReviewToken(guest.ref)}`);
    check('another order’s link is refused', wrongOrder.status === 403, String(wrongOrder.status));
    const accessKind = await call('GET', `/order?order_ref=${received.ref}&token=${createOrderAccessToken(received.ref)}`);
    check('a checkout access token is not a review link', accessKind.status === 403, String(accessKind.status));
    const otherUser = await call('GET', `/order?order_ref=${received.ref}`, undefined, adminJwt);
    check('signed in as someone else, with no link, is refused', otherUser.status === 403, String(otherUser.status));

    const early = await call('PUT', `/order/${productId}`, review(notYet.ref, createOrderReviewToken(notYet.ref), 5, 'Lovely bag, really well made.'));
    check('an order not yet received can not be reviewed', early.status === 400, `${early.status} ${early.message}`);
    const voucherPage = await call('GET', `/order?order_ref=${voucherSale.ref}&token=${createOrderReviewToken(voucherSale.ref)}`);
    check('a gift voucher purchase has nothing to review', voucherPage.status === 200 && voucherPage.data.can_review === false && voucherPage.data.items.length === 0);
    const notInOrder = await call('PUT', `/order/${otherProductId}`, review(guest.ref, createOrderReviewToken(guest.ref), 4, 'Not something I bought here.'));
    check('a product that isn’t in the order can not be reviewed', notInOrder.status === 400, `${notInOrder.status} ${notInOrder.message}`);
    const tooShort = await call('PUT', `/order/${productId}`, review(received.ref, reviewToken, 5, 'ok'));
    check('a too-short review is refused with a message', tooShort.status === 400 && Boolean(tooShort.message), `${tooShort.status} ${tooShort.message}`);
    const badRating = await call('PUT', `/order/${productId}`, review(received.ref, reviewToken, 6, 'Lovely bag, really well made.'));
    check('a rating outside 1–5 is refused', badRating.status === 400);

    // 2. Writing and editing.
    const written = await call('PUT', `/order/${productId}`, review(received.ref, reviewToken, 4, 'Lovely bag, really well made.', 'Great everyday bag'));
    const reviewId = Number(written.data?.id);
    const [row] = await sql`SELECT * FROM product_reviews WHERE id = ${reviewId}`;
    check('a review is saved as pending, with the public name and what was bought',
        written.status === 201 && row?.status === 'PENDING' && row.author_name === 'Amani W.' && row.variant_label === 'M / Navy' && Number(row.user_id) === CUSTOMER,
        JSON.stringify(row));
    const alerts = await sql`SELECT count(*)::int AS n FROM in_app_notifications WHERE type = 'REVIEW_PENDING' AND recipient_id = ${ADMIN}`;
    check('admins are told there is a review to check', alerts[0].n === 1, String(alerts[0].n));
    const hidden = await call('GET', `/products/${productId}`);
    check('a pending review isn’t public', hidden.status === 200 && hidden.data.summary.count === 0 && hidden.data.reviews.length === 0);

    const approve = await call('POST', `/admin/${reviewId}/approve`, undefined, adminJwt);
    const shown = await call('GET', `/products/${productId}`);
    const publicReview = shown.data?.reviews?.[0];
    check('approving publishes it, without email or phone',
        approve.status === 200 && shown.data.summary.count === 1 && shown.data.summary.average === 4 && publicReview?.author_name === 'Amani W.'
        && !JSON.stringify(shown.data).includes('example.invalid') && !JSON.stringify(shown.data).includes('2547'), JSON.stringify(shown.data));
    const customerCantModerate = await call('POST', `/admin/${reviewId}/approve`, undefined, customerJwt);
    check('customers can not moderate', customerCantModerate.status === 403, String(customerCantModerate.status));

    const replied = await call('PUT', `/admin/${reviewId}/reply`, { body: 'Thank you, Amani!' }, adminJwt);
    const withReply = await call('GET', `/products/${productId}`);
    check('a reply from Bagstreet is shown under the review', replied.status === 200 && withReply.data.reviews[0].reply?.body === 'Thank you, Amani!');

    const edited = await call('PUT', `/order/${productId}`, review(received.ref, undefined, 2, 'The strap broke after two weeks.'), customerJwt);
    const [afterEdit] = await sql`SELECT status, rating, reply_body FROM product_reviews WHERE id = ${reviewId}`;
    const afterEditPublic = await call('GET', `/products/${productId}`);
    check('editing sends the review back for approval and hides it meanwhile',
        edited.status === 201 && Number(edited.data.id) === reviewId && afterEdit.status === 'PENDING' && Number(afterEdit.rating) === 2
        && afterEditPublic.data.summary.count === 0, JSON.stringify(afterEdit));
    const alertsAfterEdit = await sql`SELECT count(*)::int AS n FROM in_app_notifications WHERE type = 'REVIEW_PENDING' AND recipient_id = ${ADMIN}`;
    check('an edited review is flagged to staff again', alertsAfterEdit[0].n === 2, String(alertsAfterEdit[0].n));

    const noReason = await call('POST', `/admin/${reviewId}/reject`, { reason: '' }, adminJwt);
    check('not publishing needs a reason', noReason.status === 400);
    const rejected = await call('POST', `/admin/${reviewId}/reject`, { reason: 'Contains personal details' }, adminJwt);
    const customerView = await call('GET', `/order?order_ref=${received.ref}&token=${reviewToken}`);
    const mine = customerView.data.items.find((i: any) => Number(i.product_id) === productId)?.review;
    check('the customer sees it wasn’t published, and why', rejected.status === 200 && mine?.status === 'REJECTED' && mine.reject_reason === 'Contains personal details');
    const audit = await sql`SELECT action FROM audit_logs WHERE actor_user_id = ${ADMIN} AND entity_type = 'product_review' ORDER BY id`;
    check('moderation and replies are in the audit log',
        audit.map((a: any) => a.action).join(',') === 'REVIEW_APPROVED,REVIEW_REPLIED,REVIEW_REJECTED', audit.map((a: any) => a.action).join(','));

    // 3. Ratings on listings: average and count of approved reviews only.
    const second = await call('PUT', `/order/${productId}`, review(guest.ref, createOrderReviewToken(guest.ref), 5, 'Beautiful leather, worth it.'));
    await call('POST', `/admin/${second.data.id}/approve`, undefined, adminJwt);
    await call('POST', `/admin/${reviewId}/approve`, undefined, adminJwt);
    const summary = (await reviewsQueries.summaries([productId, otherProductId])).get(productId);
    check('listing summary: average of the approved reviews', summary?.average === 3.5 && summary.count === 2, JSON.stringify(summary));
    const counts = await call('GET', '/admin/counts', undefined, adminJwt);
    const pendingList = await call('GET', '/admin?status=APPROVED&limit=50', undefined, adminJwt);
    check('admin counts and list include the reviews', counts.status === 200 && counts.data.approved >= 2
        && (pendingList.data ?? []).some((r: any) => Number(r.id) === reviewId && r.order_number.startsWith('ZZR-')));

    // 4. Deleting.
    const wrongDelete = await call('DELETE', `/order/${productId}`, { order_ref: received.ref, token: createOrderReviewToken(guest.ref) });
    check('a review can’t be deleted with someone else’s link', wrongDelete.status === 403);
    const deleted = await call('DELETE', `/order/${productId}`, { order_ref: guest.ref, token: createOrderReviewToken(guest.ref) });
    const afterDelete = await call('GET', `/products/${productId}`);
    check('the customer can delete their review', deleted.status === 200 && afterDelete.data.summary.count === 1);

    // 5. Invitations: received 5+ days ago, sent once, never for voucher sales, never to the unsubscribed.
    const candidates = await reviewsQueries.inviteCandidates(REVIEW_INVITE_DELAY_DAYS, 500);
    const ours = new Set(orderIds);
    const candidateIds = candidates.map((c) => Number(c.id));
    check('invited: received 6 days ago; not: not yet received, voucher sale, received 2 days ago',
        candidateIds.includes(received.id) && !candidateIds.includes(notYet.id) && !candidateIds.includes(voucherSale.id) && !candidateIds.includes(guest.id),
        candidateIds.filter((id) => ours.has(id)).join(','));
    // Real dev orders that are due would be invited by this run too: reserve their keys, give them back after.
    for (const c of candidates) {
        if (ours.has(Number(c.id))) continue;
        borrowedOrderIds.push(Number(c.id));
        await guard(`review-invite:${c.id}`);
    }
    await sendDueReviewInvites();
    const [{ sent_at }] = await sql`SELECT review_invite_sent_at AS sent_at FROM orders WHERE id = ${received.id}`;
    check('the invitation is marked sent', sent_at != null);
    const again = await reviewsQueries.inviteCandidates(REVIEW_INVITE_DELAY_DAYS, 500);
    check('and is never sent twice', !again.some((c) => Number(c.id) === received.id));
    const queued = await sql`SELECT count(*)::int AS n FROM email_outbox WHERE dedupe_key = ${`review-invite:${received.id}`} AND job_type <> 'ZZ_TEST'`;
    check('no real email was queued by the test', queued[0].n === 0);

    const unsub = await makeOrder({ userId: null, status: 'DELIVERED', deliveredDaysAgo: 6, email: `zz-unsub-${tag}@example.invalid` });
    await sql`INSERT INTO email_preferences(id, email, unsubscribed_at) VALUES (${randomUUID()}, ${`zz-unsub-${tag}@example.invalid`}, now()) ON CONFLICT DO NOTHING`;
    const noEmail = await makeOrder({ userId: null, status: 'DELIVERED', deliveredDaysAgo: 6, email: null });
    const old = await makeOrder({ userId: null, status: 'DELIVERED', deliveredDaysAgo: 40 });
    const later = (await reviewsQueries.inviteCandidates(REVIEW_INVITE_DELAY_DAYS, 500)).map((c) => Number(c.id));
    check('not invited: unsubscribed, no email, received over 30 days ago',
        !later.includes(unsub.id) && !later.includes(noEmail.id) && !later.includes(old.id));

    // 6. Account erasure removes the customer's reviews.
    const before = await sql`SELECT count(*)::int AS n FROM product_reviews WHERE order_id = ${received.id}`;
    const actor = { sub: String(ADMIN), email: admin.email, role: 'ADMIN' } as AuthUser;
    const erasure = await createPrivacyRequest({ userId: CUSTOMER, email: customerEmail, kind: 'ERASURE', details: 'zz test' }, actor);
    await eraseCustomerAccount(erasure.id, 'Financial records retained (zz test).', actor);
    const after = await sql`SELECT count(*)::int AS n FROM product_reviews WHERE order_id = ${received.id}`;
    check('erasing the account removes their reviews', before[0].n === 1 && after[0].n === 0, `${before[0].n} → ${after[0].n}`);
} catch (error) {
    console.error(error);
    check('review suite completed without unexpected errors', false);
} finally {
    if (borrowedOrderIds.length) await sql`UPDATE orders SET review_invite_sent_at = NULL WHERE id IN ${sql(borrowedOrderIds)}`;
    if (guardKeys.length) await sql`DELETE FROM email_outbox WHERE job_type = 'ZZ_TEST' AND dedupe_key IN ${sql(guardKeys)}`;
    await sql`DELETE FROM in_app_notifications WHERE type = 'REVIEW_PENDING' AND title LIKE 'New review to check: ZZ Review Product%'`;
    await sql`DELETE FROM email_preferences WHERE email = ${`zz-unsub-${tag}@example.invalid`}`;
    if (orderIds.length) await sql`DELETE FROM orders WHERE id IN ${sql(orderIds)}`;
    if (productId || otherProductId) await sql`DELETE FROM products WHERE id IN ${sql([productId, otherProductId].filter(Boolean))}`;
    if (categoryId) await sql`DELETE FROM categories WHERE id = ${categoryId}`;
    if (userIds.length) {
        await sql`DELETE FROM privacy_requests WHERE user_id IN ${sql(userIds)}`;
        await sql`DELETE FROM audit_logs WHERE actor_user_id IN ${sql(userIds)}`;
        await sql`DELETE FROM users WHERE id IN ${sql(userIds)}`;
    }
    await closeDatabase();
}

for (const [name, ok, detail] of results) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !detail ? '' : `\n     ${detail}`}`);
console.log(`${results.filter(([, ok]) => ok).length}/${results.length} review checks passed. Test data removed. No emails sent.`);
if (results.some(([, ok]) => !ok)) process.exitCode = 1;
