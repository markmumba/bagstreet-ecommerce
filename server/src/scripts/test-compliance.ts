/** Disposable SQL/API fixtures. Never starts workers, sends email, or contacts a payment provider. */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { USER_ROLE, POLICY_VERSION, LEGAL_POLICIES, ACCOUNTING_DATASET, type PrivacyRequest, type ComplianceIncident } from 'shared/dist';
import { sql, closeDatabase } from '../lib/db';
import { env } from '../config/env';
import type { AppEnv, AuthUser } from '../lib/hono';
import { getRequiredUser } from '../lib/hono';
import { errorHandler } from '../middleware/error-handler';
import { requireAuth, requireRole, optionalAuth } from '../middleware/auth.middleware';
import routes from '../features/compliance/compliance.routes';
import { accountingExport, createPrivacyRequest, customerData, eraseCustomerAccount } from '../features/compliance/compliance.queries';
import { archivedAgreement, type OrderAgreementSnapshot } from '../features/compliance/order-agreement';
import { toJsonbParam, readJsonColumn } from '../lib/json-column';
import { createAuditLog } from '../lib/audit';
import { enqueueEmail } from '../services/email-outbox';
import { ordersQueries } from '../features/orders/orders.queries';
import { AppError } from '../lib/errors';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import notificationsRoutes from '../features/notifications/notifications.routes';

if (env.NODE_ENV === 'production') throw new Error('Compliance fixtures must not run in production');
const tag = randomUUID();
const password = `Test-only-${randomBytes(12).toString('hex')}`;
const users: { id: number; email: string; role: string }[] = [];
const results: [string, boolean][] = [];
const check = (name: string, ok: boolean) => { results.push([name, ok]); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); };
const guestEmail = `guest-${tag}@example.invalid`;
const incidents: string[] = [];
const responseData = async <T>(response: Response) => (await response.json() as { data: T }).data;
const app = new Hono<AppEnv>();
app.onError((error, c) => error instanceof AppError ? c.json({ success: false, message: error.message }, error.statusCode as ContentfulStatusCode) : errorHandler(error, c));
app.route('/api/compliance', routes);
app.route('/api/notifications', notificationsRoutes);
app.get('/staff', requireAuth, requireRole(USER_ROLE.ADMIN), c => c.json(getRequiredUser(c)));
app.get('/optional', optionalAuth, c => c.json({ signed_in: Boolean(c.get('user')) }));

try {
    for (const role of [USER_ROLE.ADMIN, USER_ROLE.CUSTOMER, USER_ROLE.MANAGER]) {
        const [row] = await sql<{ id: number; email: string; role: string }[]>`INSERT INTO users(email, password_hash, full_name, role, is_active)
            VALUES (${`${role.toLowerCase()}-${tag}@example.invalid`}, ${await Bun.password.hash(password)}, 'Compliance test', ${role}, true) RETURNING id, email, role`;
        users.push({ ...row!, id: Number(row!.id) });
    }
    const [admin, customer, manager] = users;
    const actor: AuthUser = { sub: String(admin!.id), email: admin!.email, role: admin!.role };
    const token = (user: typeof users[number], role = user.role) => sign({ sub: String(user.id), email: user.email, role, exp: Math.floor(Date.now() / 1000) + 600 }, env.JWT_SECRET, 'HS256');
    const adminToken = await token(admin!);
    const customerToken = await token(customer!);
    const managerToken = await token(manager!);
    const request = async (path: string, bearer = adminToken, method = 'GET', body?: unknown) => app.request(path, {
        method, headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
    });
    check('anonymous customer-data access is denied', (await app.request('/api/compliance/me/export')).status === 401);
    check('customers cannot access admin compliance', (await request('/api/compliance/admin/requests', customerToken)).status === 403);
    check('managers cannot access compliance or accounting', (await request('/api/compliance/admin/accounting?month=2050-06&dataset=orders', managerToken)).status === 403);
    check('JWT role claims cannot override the current database role', (await request('/staff', await token(customer!, USER_ROLE.ADMIN))).status === 403);
    const selfExport = await request('/api/compliance/me/export', customerToken);
    const selfData = await selfExport.json();
    check('customer export omits passwords, tokens and other accounts', selfExport.status === 200 && selfExport.headers.get('cache-control') === 'no-store'
        && !JSON.stringify(selfData).includes('password_hash') && !JSON.stringify(selfData).includes(admin!.email));
    const submitted = await request('/api/compliance/me/requests', customerToken, 'POST', { kind: 'ACCESS', details: 'Please provide my account records.' });
    const submittedData = await responseData<PrivacyRequest>(submitted);
    check('signed-in request is identity verified and account linked', submitted.status === 201 && Number(submittedData.user_id) === customer!.id && Boolean(submittedData.identity_verified_at));
    const guestResponse = await request('/api/compliance/admin/requests', adminToken, 'POST', { email: guestEmail, kind: 'ACCESS', details: 'Received through support; identity not yet verified.' });
    const guest = await responseData<PrivacyRequest>(guestResponse);
    check('recorded guest requests remain unverified and unlinked', guestResponse.status === 201 && !guest.user_id && !guest.identity_verified_at);
    check('unverified guest data cannot be exported', (await request(`/api/compliance/admin/requests/${guest.id}/export`)).status === 400);
    check('unverified requests cannot be completed', (await request(`/api/compliance/admin/requests/${guest.id}`, adminToken, 'PATCH', { status: 'COMPLETED', resolution: 'Attempted without identity verification' })).status === 400);
    check('account erasure requires explicit confirmation', (await request(`/api/compliance/admin/requests/${submittedData.id}/erase-account`, adminToken, 'POST', { retention_reason: 'Financial records retained for review' })).status === 400);
    const verified = await request(`/api/compliance/admin/requests/${guest.id}`, adminToken, 'PATCH', { status: 'IN_PROGRESS', verify_identity: true, resolution: 'Verified through the existing customer channel and order evidence.' });
    check('admin verification is recorded separately from completion', verified.status === 200 && Boolean((await responseData<PrivacyRequest>(verified)).identity_verified_at));
    const incidentResponse = await request('/api/compliance/admin/incidents', adminToken, 'POST', { title: `Test incident ${tag}`, severity: 'LOW', aware_at: new Date(Date.now() - 3600000).toISOString(), summary: 'Synthetic test; no actual personal data breach.' });
    const incident = await responseData<ComplianceIncident>(incidentResponse);
    if (incident?.id) incidents.push(incident.id);
    check('incident review marker is awareness plus 72 hours', incidentResponse.status === 201 && Date.parse(incident.review_due_at) - Date.parse(incident.aware_at) === 72 * 3600000);
    const review = { status: 'CLOSED', notification_decision: 'PENDING', decision_reason: 'Synthetic record review', regulator_notified_at: null, customers_notified_at: null };
    check('incident cannot close before notification assessment', (await request(`/api/compliance/admin/incidents/${incident.id}`, adminToken, 'PATCH', review)).status === 400);
    check('future notification times are rejected', (await request(`/api/compliance/admin/incidents/${incident.id}`, adminToken, 'PATCH', { ...review, notification_decision: 'NOT_REQUIRED', regulator_notified_at: new Date(Date.now() + 3600000).toISOString() })).status === 400);
    check('incident can close with a documented assessment', (await request(`/api/compliance/admin/incidents/${incident.id}`, adminToken, 'PATCH', { ...review, notification_decision: 'NOT_REQUIRED' })).status === 200);

    const rollback = new Error('ROLLBACK_COMPLIANCE_FIXTURES');
    try {
        await sql.begin(async tx => {
            const email = `erasure-${tag}@example.invalid`;
            const [person] = await tx`INSERT INTO users(email, password_hash, full_name, role, is_active) VALUES (${email}, 'hash-not-a-login', 'Test buyer', 'CUSTOMER', true) RETURNING id`;
            const personId = Number(person!.id);
            const [category] = await tx`INSERT INTO categories(name, slug) VALUES ('Compliance test', ${tag}) RETURNING id`;
            const [product] = await tx`INSERT INTO products(category_id, sku, name, slug, price, stock, image_url, is_active)
                VALUES (${category!.id}, ${tag}, 'Original test tote', ${tag}, 1000, 0, '', true) RETURNING id`;
            const [variant] = await tx`INSERT INTO product_variants(product_id, sku, stock) VALUES (${product!.id}, ${tag}, 10) RETURNING id`;
            const [order] = await tx`INSERT INTO orders(user_id, order_number, total_amount, shipping_address, customer_email, customer_name, customer_phone, status, discount_amount, discount_code, created_at)
                VALUES (${personId}, ${`CT-${tag.slice(0, 20)}`}, 1100, ${toJsonbParam({ full_name: 'Test buyer', address_line1: 'Private test address' })}::jsonb, ${email}, 'Test buyer', '254700000000', 'CONFIRMED', 100, 'TEST', '2050-06-15 12:00:00') RETURNING id`;
            const orderId = Number(order!.id);
            await tx`INSERT INTO order_items(order_id, product_id, variant_id, variant_sku, quantity, unit_price, subtotal) VALUES (${orderId}, ${product!.id}, ${variant!.id}, ${tag}, 1, 1000, 1000)`;
            await tx`INSERT INTO cart_items(user_id, variant_id, quantity) VALUES (${personId}, ${variant!.id}, 1)`;
            await tx`INSERT INTO refresh_tokens(user_id, token_hash, expires_at) VALUES (${personId}, ${tag}, now() + interval '1 day')`;
            await tx`INSERT INTO user_invitations(user_id, token_hash, expires_at) VALUES (${personId}, ${tag}, now() + interval '1 day')`;
            await tx`INSERT INTO password_reset_tokens(user_id, token_hash, expires_at) VALUES (${personId}, ${tag}, now() + interval '1 day')`;
            await tx`INSERT INTO in_app_notifications(recipient_id, title) VALUES (${personId}, 'Test notification')`;
            const snapshot: OrderAgreementSnapshot = { policies: LEGAL_POLICIES, order: {
                number: `CT-${tag.slice(0, 20)}`, submitted_at: '2050-06-15T12:00:00Z', customer: 'Test buyer', email, address: { city: 'Nairobi' },
                notes: null, total: 1100, shipping: 200, discount: 100, items: [{ name: 'Original test tote', sku: tag, size: null, color: null, quantity: 1, unit_price: 1000 }],
            } };
            await tx`INSERT INTO order_policy_acceptances(order_id, policy_version, policy_snapshot, accepted_at) VALUES (${orderId}, ${POLICY_VERSION}, ${toJsonbParam(snapshot)}::jsonb, '2050-06-15T12:00:00Z')`;
            await tx`UPDATE products SET name = 'Changed test tote' WHERE id = ${product!.id}`;
            check('agreement copy uses archived names, prices and policies', (await archivedAgreement(orderId, tx)).text.includes('Original test tote'));
            const job = { type: 'ORDER_AGREEMENT' as const, to: email, orderId };
            check('agreement email is transactional and deduplicated', await enqueueEmail(job, { tx, dedupeKey: tag }) && !await enqueueEmail(job, { tx, dedupeKey: tag }));
            const [outside] = await sql`SELECT id FROM email_outbox WHERE dedupe_key = ${tag}`;
            check('uncommitted agreement email is invisible to the live worker', !outside);
            for (const entry of ['PAYMENT_CAPTURED','REFUND_ISSUED','PROVIDER_FEE']) await tx`INSERT INTO payment_ledger_entries(order_id, entry_type, direction, amount, reference, created_at)
                VALUES (${orderId}, ${entry}, ${entry === 'PAYMENT_CAPTURED' ? 'CREDIT' : 'DEBIT'}, 10, ${`${tag}-${entry}`}, '2050-06-15 12:00:00')`;
            await tx`INSERT INTO inventory_movements(variant_id, delta, reason, reference_id, created_at) VALUES (${variant!.id}, 1, 'RESTOCK', ${orderId}, '2050-06-15 12:00:00')`;
            for (const dataset of ACCOUNTING_DATASET) {
                const result = await accountingExport('2050-06', dataset, actor, tx);
                check(`${dataset} CSV is valid, hashed and excludes customer contact/address`, result.row_count > 0 && !result.csv.includes(email) && !result.csv.includes('Private test address') && result.sha256 === createHash('sha256').update(result.csv).digest('hex'));
                if (dataset === 'refunds') check('refund export excludes captures and provider fees', result.csv.includes('REFUND_ISSUED') && !result.csv.includes('PAYMENT_CAPTURED') && !result.csv.includes('PROVIDER_FEE'));
            }
            const data = await customerData(personId, tx);
            check('customer export includes own order and acceptance but no credentials', data.orders.length === 1 && data.agreements.length === 1 && !JSON.stringify(data).includes('hash-not-a-login'));
            const unverified = await createPrivacyRequest({ email, kind: 'ERASURE', details: 'Guest request using the same email.' }, actor, tx);
            check('email matching alone does not verify or link a request', !unverified.user_id && !unverified.identity_verified_at);
            let blocked = false;
            try { await eraseCustomerAccount(unverified.id, 'Tax evidence retained', actor, tx); } catch { blocked = true; }
            check('guest request cannot trigger automatic account erasure', blocked);
            const erasure = await createPrivacyRequest({ userId: personId, email, kind: 'ERASURE', details: 'Please remove my account.' }, actor, tx);
            blocked = false;
            try { await eraseCustomerAccount(erasure.id, 'Tax evidence retained', actor, tx); } catch { blocked = true; }
            check('active orders block account erasure', blocked);
            await tx`UPDATE orders SET status = 'DELIVERED' WHERE id = ${orderId}`;
            await eraseCustomerAccount(erasure.id, 'Financial records retained under the approved tax and dispute schedule.', actor, tx);
            const [erased] = await tx`SELECT * FROM users WHERE id = ${personId}`;
            check('erasure anonymises profile and disables login', !erased!.is_active && erased!.full_name === 'Deleted customer' && erased!.email !== email && erased!.password_hash !== 'hash-not-a-login');
            const [remaining] = await tx`SELECT (SELECT count(*) FROM cart_items WHERE user_id = ${personId}) + (SELECT count(*) FROM refresh_tokens WHERE user_id = ${personId}) +
                (SELECT count(*) FROM user_invitations WHERE user_id = ${personId}) + (SELECT count(*) FROM password_reset_tokens WHERE user_id = ${personId}) + (SELECT count(*) FROM in_app_notifications WHERE recipient_id = ${personId}) AS count`;
            check('erasure removes cart, sessions, invitations, reset tokens and notifications', Number(remaining!.count) === 0);
            check('erasure retains financial and agreement evidence', (await tx`SELECT id FROM orders WHERE id = ${orderId}`).length === 1 && (await tx`SELECT id FROM payment_ledger_entries WHERE order_id = ${orderId}`).length === 3 && (await tx`SELECT order_id FROM order_policy_acceptances WHERE order_id = ${orderId}`).length === 1);
            const [suppression] = await tx`SELECT recovery_opt_in, unsubscribed_at FROM email_preferences WHERE email = ${email}`;
            check('erasure preserves unsubscribe suppression', suppression?.recovery_opt_in === false && Boolean(suppression.unsubscribed_at));
            await createAuditLog({ actor, action: 'COMPLIANCE_TEST', entityType: 'test', entityId: tag, after: { password_hash: 'secret-hash', nested: { token: 'private-token' } } }, tx);
            const [audit] = await tx`SELECT after_state FROM audit_logs WHERE entity_id = ${tag}`;
            check('SQL audit records redact nested secrets', !JSON.stringify(readJsonColumn(audit!.after_state)).includes('private-token') && !JSON.stringify(readJsonColumn(audit!.after_state)).includes('secret-hash'));
            throw rollback;
        });
    } catch (error) { if (error !== rollback) throw error; }
    check('rollback leaves no agreement email to send', (await sql`SELECT id FROM email_outbox WHERE dedupe_key = ${tag}`).length === 0);

    // Exercise the real creation transaction without stock or email delivery side effects.
    const order = await ordersQueries.create(customer!.id, [], 0, { full_name: 'Compliance test', address_line1: 'Test', city: 'Nairobi', state: 'Nairobi', postal_code: '', country: 'Kenya' }, null, 0, undefined, null, 0, 'Compliance test', '254700000000', null, { policyAcceptance: { accepted: true, version: POLICY_VERSION } });
    check('order creation stores the accepted policy archive', (await archivedAgreement(Number(order.id))).text.includes(POLICY_VERSION));
    await sql`UPDATE users SET is_active = false WHERE id = ${customer!.id}`;
    check('existing JWT stops working immediately after deactivation', (await request('/api/compliance/me/export', customerToken)).status === 401);
    check('notification stream rejects deactivated account tokens', (await app.request(`/api/notifications/stream?token=${customerToken}`)).status === 401);
    check('optional auth treats the inactive account as a guest', (await (await request('/optional', customerToken)).json() as { signed_in: boolean }).signed_in === false);
    let inactiveBlocked = false;
    try { await ordersQueries.create(customer!.id, [], 0, { full_name: 'Test', address_line1: 'Test', city: 'Nairobi', state: 'Nairobi', postal_code: '', country: 'Kenya' }, null, 0, undefined, null, 0, 'Test', '254700000000', null); } catch { inactiveBlocked = true; }
    check('a stale authenticated checkout cannot recreate an erased account order', inactiveBlocked);

    if (process.argv.includes('--preview')) {
        await sql`UPDATE users SET is_active = true WHERE id = ${customer!.id}`;
        console.log(`PREVIEW_ADMIN=${admin!.email}\nPREVIEW_CUSTOMER=${customer!.email}\nPREVIEW_PASSWORD=${password}`);
        console.log('Press Enter after browser checks to remove these test accounts.');
        const reader = Bun.stdin.stream().getReader(); await reader.read(); await reader.cancel(); reader.releaseLock();
    }
} catch (error) {
    console.error(error); check('integration suite completed without unexpected errors', false); process.exitCode = 1;
} finally {
    const ids = users.map(user => user.id);
    if (ids.length) {
        await sql`DELETE FROM order_policy_acceptances WHERE order_id IN (SELECT id FROM orders WHERE user_id IN ${sql(ids)})`;
        await sql`DELETE FROM orders WHERE user_id IN ${sql(ids)}`;
        await sql`DELETE FROM privacy_requests WHERE user_id IN ${sql(ids)} OR email = ${guestEmail}`;
        await sql`DELETE FROM compliance_export_records WHERE actor_user_id IN ${sql(ids)}`;
        if (incidents.length) await sql`DELETE FROM compliance_incidents WHERE id IN ${sql(incidents)}`;
        await sql`DELETE FROM audit_logs WHERE actor_user_id IN ${sql(ids)}`;
        await sql`DELETE FROM users WHERE id IN ${sql(ids)}`;
    }
    await closeDatabase();
}
console.log(`${results.filter(([, ok]) => ok).length}/${results.length} compliance checks passed. Test accounts removed. No emails or payments sent.`);
if (results.some(([, ok]) => !ok)) process.exitCode = 1;
