import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { AppEnv } from '../../lib/hono';
import { getRequiredUser } from '../../lib/hono';
import { sql } from '../../lib/db';
import { success } from '../../lib/response';
import { BadRequestError, NotFoundError, ValidationError } from '../../lib/errors';
import { requireAuth, requireRole } from '../../middleware/auth.middleware';
import { rateLimit } from '../../middleware/rate-limit.middleware';
import { auditFromContext, createAuditLog } from '../../lib/audit';
import { USER_ROLE, PRIVACY_REQUEST_KIND, PRIVACY_REQUEST_STATUS, ACCOUNTING_DATASET,
    type PrivacyRequest, type ComplianceIncident, type ProductEvidence } from 'shared/dist';
import { customerData, createPrivacyRequest, eraseCustomerAccount, accountingExport } from './compliance.queries';
import { monthSchema } from './compliance.policy';

const routes = new Hono<AppEnv>();
const requestSchema = z.object({ kind: z.enum(PRIVACY_REQUEST_KIND), details: z.string().trim().min(5).max(2000) });
const id = z.string().uuid();
const note = z.string().trim().min(8).max(2000);
const notificationTime = z.string().datetime().refine(value => Date.parse(value) <= Date.now(), 'Notification time cannot be in the future').nullable();
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
    const result = schema.safeParse(value);
    if (!result.success) throw new ValidationError('Invalid compliance data', result.error.errors);
    return result.data;
}
routes.use('*', requireAuth, async (c, next) => { c.header('Cache-Control', 'no-store'); await next(); });
routes.use('*', rateLimit({ scope: 'compliance', limit: 20, windowMs: 60_000 }));

routes.get('/me/export', requireRole(USER_ROLE.CUSTOMER), async c => {
    const user = getRequiredUser(c);
    const data = await customerData(Number(user.sub));
    await auditFromContext(c, { action: 'CUSTOMER_DATA_EXPORTED', entityType: 'user', entityId: user.sub });
    return success(c, data);
});
routes.get('/me/requests', requireRole(USER_ROLE.CUSTOMER), async c => {
    const rows = await sql<PrivacyRequest[]>`SELECT * FROM privacy_requests WHERE user_id = ${Number(getRequiredUser(c).sub)} ORDER BY created_at DESC LIMIT 100`;
    return success(c, rows);
});
routes.post('/me/requests', requireRole(USER_ROLE.CUSTOMER), async c => {
    const data = parse(requestSchema, await c.req.json().catch(() => null));
    const user = getRequiredUser(c);
    const row = await sql.begin(tx => createPrivacyRequest({ ...data, userId: Number(user.sub), email: user.email }, user, tx));
    return success(c, row, 'Privacy request recorded', 201);
});
routes.use('/admin/*', requireRole(USER_ROLE.ADMIN));
routes.get('/admin/requests', async c => {
    const page = parse(z.coerce.number().int().min(1).max(10000), c.req.query('page') ?? 1);
    return success(c, await sql<PrivacyRequest[]>`SELECT * FROM privacy_requests ORDER BY created_at DESC LIMIT 50 OFFSET ${(page - 1) * 50}`);
});
routes.post('/admin/requests', async c => {
    const data = parse(requestSchema.extend({ email: z.string().trim().email().max(254) }), await c.req.json().catch(() => null));
    const row = await sql.begin(tx => createPrivacyRequest(data, getRequiredUser(c), tx));
    return success(c, row, 'Unverified privacy request recorded', 201);
});
routes.patch('/admin/requests/:id', async c => {
    const requestId = parse(id, c.req.param('id'));
    const data = parse(z.object({ status: z.enum(PRIVACY_REQUEST_STATUS), resolution: note, verify_identity: z.boolean().default(false) }), await c.req.json().catch(() => null));
    const row = await sql.begin(async tx => {
        const [before] = await tx<PrivacyRequest[]>`SELECT * FROM privacy_requests WHERE id = ${requestId} FOR UPDATE`;
        if (!before) throw new NotFoundError('Privacy request');
        if (['COMPLETED', 'REJECTED'].includes(before.status)) throw new BadRequestError('This request is closed. Record a new request for further action.');
        if (data.status === 'COMPLETED' && !before.identity_verified_at && !data.verify_identity) throw new BadRequestError('Verify the requester identity before completing a request.');
        const [updated] = await tx<PrivacyRequest[]>`UPDATE privacy_requests SET status = ${data.status}, resolution = ${data.resolution},
            identity_verified_at = CASE WHEN ${data.verify_identity} THEN COALESCE(identity_verified_at, now()) ELSE identity_verified_at END,
            resolved_at = CASE WHEN ${['COMPLETED','REJECTED'].includes(data.status)} THEN now() ELSE NULL END WHERE id = ${requestId} RETURNING *`;
        await createAuditLog({ actor: getRequiredUser(c), action: 'PRIVACY_REQUEST_UPDATED', entityType: 'privacy_request', entityId: requestId,
            before: { status: before.status }, after: { status: data.status }, metadata: { resolution: data.resolution, verified: Boolean(updated?.identity_verified_at) } }, tx);
        return updated;
    });
    return success(c, row);
});
routes.get('/admin/requests/:id/export', async c => {
    const [request] = await sql<PrivacyRequest[]>`SELECT * FROM privacy_requests WHERE id = ${parse(id, c.req.param('id'))}`;
    if (!request?.user_id || !request.identity_verified_at) throw new BadRequestError('A verified, account-linked request is required. Guest exports need a manually verified record review.');
    const data = await customerData(Number(request.user_id));
    await auditFromContext(c, { action: 'PRIVACY_REQUEST_EXPORTED', entityType: 'privacy_request', entityId: request.id });
    return success(c, data);
});
routes.post('/admin/requests/:id/erase-account', async c => {
    const data = parse(z.object({ retention_reason: note, confirmed: z.literal(true) }), await c.req.json().catch(() => null));
    return success(c, await eraseCustomerAccount(parse(id, c.req.param('id')), data.retention_reason, getRequiredUser(c)));
});
routes.get('/admin/incidents', async c => success(c, await sql<ComplianceIncident[]>`SELECT * FROM compliance_incidents ORDER BY aware_at DESC LIMIT 100`));
routes.post('/admin/incidents', async c => {
    const data = parse(z.object({ title: z.string().trim().min(5).max(200), severity: z.enum(['LOW','MEDIUM','HIGH','CRITICAL']),
        aware_at: z.string().datetime().refine(value => Date.parse(value) <= Date.now(), 'Awareness time cannot be in the future'), summary: note }), await c.req.json().catch(() => null));
    const incidentId = randomUUID();
    const row = await sql.begin(async tx => {
        const [incident] = await tx<ComplianceIncident[]>`INSERT INTO compliance_incidents(id, title, severity, aware_at, review_due_at, summary)
            VALUES (${incidentId}, ${data.title}, ${data.severity}, ${data.aware_at}, ${new Date(Date.parse(data.aware_at) + 72 * 3600000).toISOString()}, ${data.summary}) RETURNING *`;
        await createAuditLog({ actor: getRequiredUser(c), action: 'COMPLIANCE_INCIDENT_CREATED', entityType: 'incident', entityId: incidentId, metadata: { severity: data.severity } }, tx);
        return incident;
    });
    return success(c, row, 'Incident recorded', 201);
});
routes.patch('/admin/incidents/:id', async c => {
    const incidentId = parse(id, c.req.param('id'));
    const data = parse(z.object({ status: z.enum(['OPEN','CONTAINED','CLOSED']), notification_decision: z.enum(['PENDING','REQUIRED','NOT_REQUIRED']),
        decision_reason: note, regulator_notified_at: notificationTime, customers_notified_at: notificationTime }), await c.req.json().catch(() => null));
    if (data.status === 'CLOSED' && data.notification_decision === 'PENDING') throw new BadRequestError('Record a notification assessment before closing an incident.');
    const row = await sql.begin(async tx => {
        const [before] = await tx<ComplianceIncident[]>`SELECT * FROM compliance_incidents WHERE id = ${incidentId} FOR UPDATE`;
        if (!before) throw new NotFoundError('Incident');
        const [incident] = await tx<ComplianceIncident[]>`UPDATE compliance_incidents SET status = ${data.status}, notification_decision = ${data.notification_decision},
            decision_reason = ${data.decision_reason}, regulator_notified_at = ${data.regulator_notified_at}, customers_notified_at = ${data.customers_notified_at}
            WHERE id = ${incidentId} RETURNING *`;
        await createAuditLog({ actor: getRequiredUser(c), action: 'COMPLIANCE_INCIDENT_UPDATED', entityType: 'incident', entityId: incidentId,
            metadata: data }, tx);
        return incident;
    });
    return success(c, row);
});
const productId = z.coerce.number().int().positive();
routes.get('/admin/evidence/:productId', async c => {
    const [row] = await sql<ProductEvidence[]>`SELECT * FROM product_compliance_evidence WHERE product_id = ${parse(productId, c.req.param('productId'))}`;
    return success(c, row ?? null);
});
routes.put('/admin/evidence/:productId', async c => {
    const product = parse(productId, c.req.param('productId'));
    const data = parse(z.object({ supplier: z.string().trim().min(1).max(2000), invoice_reference: z.string().trim().min(1).max(2000), authenticity_evidence: note, image_rights: note, notes: z.string().trim().max(2000) }), await c.req.json().catch(() => null));
    const row = await sql.begin(async tx => {
        const [exists] = await tx`SELECT id FROM products WHERE id = ${product}`;
        if (!exists) throw new NotFoundError('Product');
        const [evidence] = await tx<ProductEvidence[]>`INSERT INTO product_compliance_evidence(product_id, supplier, invoice_reference, authenticity_evidence, image_rights, notes)
            VALUES (${product}, ${data.supplier}, ${data.invoice_reference}, ${data.authenticity_evidence}, ${data.image_rights}, ${data.notes})
            ON CONFLICT(product_id) DO UPDATE SET supplier = EXCLUDED.supplier, invoice_reference = EXCLUDED.invoice_reference,
                authenticity_evidence = EXCLUDED.authenticity_evidence, image_rights = EXCLUDED.image_rights, notes = EXCLUDED.notes, updated_at = now() RETURNING *`;
        await createAuditLog({ actor: getRequiredUser(c), action: 'PRODUCT_EVIDENCE_UPDATED', entityType: 'product', entityId: product }, tx);
        return evidence;
    });
    return success(c, row);
});
routes.get('/admin/accounting', async c => {
    const data = parse(z.object({ month: monthSchema, dataset: z.enum(ACCOUNTING_DATASET) }), c.req.query());
    return success(c, await accountingExport(data.month, data.dataset, getRequiredUser(c)));
});
export default routes;
