import { createHash, randomUUID } from 'node:crypto';
import { sql } from '../../lib/db';
import { createAuditLog } from '../../lib/audit';
import type { AuthUser } from '../../lib/hono';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { USER_ROLE, ORDER_STATUS, type PrivacyRequest, type AccountingDataset, type AccountingExport } from 'shared/dist';
import { LEDGER_ENTRY } from '../payments/order-balance';
import { csv, monthWindow } from './compliance.policy';

export async function customerData(userId: number, db = sql) {
    const [account] = await db`SELECT full_name, email, role, created_at, updated_at FROM users WHERE id = ${userId} AND role = ${USER_ROLE.CUSTOMER}`;
    if (!account) throw new NotFoundError('Customer');
    const orders = await db`SELECT public_id, order_number, status, payment_status, total_amount, shipping_cost,
        discount_amount, customer_name, customer_email, customer_phone, shipping_address, notes, created_at
        FROM orders WHERE user_id = ${userId} ORDER BY created_at`;
    const items = await db`SELECT o.order_number, i.variant_sku, i.variant_size, i.variant_color, i.quantity, i.unit_price, i.subtotal
        FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.user_id = ${userId}`;
    const payments = await db`SELECT o.order_number, p.provider, p.provider_reference, p.status, p.amount, p.currency, p.created_at
        FROM payment_transactions p JOIN orders o ON o.id = p.order_id WHERE o.user_id = ${userId}`;
    const preferences = await db`SELECT recovery_opt_in, consent_at, consent_source, unsubscribed_at FROM email_preferences WHERE email = ${String(account.email).toLowerCase()}`;
    const cart = await db`SELECT v.sku, c.quantity FROM cart_items c JOIN product_variants v ON v.id = c.variant_id WHERE c.user_id = ${userId}`;
    const agreements = await db`SELECT o.order_number, p.policy_version, p.policy_snapshot, p.accepted_at FROM order_policy_acceptances p JOIN orders o ON o.id = p.order_id WHERE o.user_id = ${userId}`;
    return { generated_at: new Date().toISOString(), account, orders, items, payments, preferences, cart, agreements,
        scope: 'Account-linked records only. Contact privacy support for guest purchases or other records. Credentials and staff security records are excluded.' };
}

export async function createPrivacyRequest(input: { userId?: number; email: string; kind: PrivacyRequest['kind']; details: string }, actor: AuthUser, db = sql) {
    const [row] = await db<PrivacyRequest[]>`INSERT INTO privacy_requests(id, user_id, email, kind, details, identity_verified_at)
        VALUES (${randomUUID()}, ${input.userId ?? null}, ${input.email.toLowerCase()}, ${input.kind}, ${input.details},
            ${input.userId ? new Date().toISOString() : null}) RETURNING *`;
    await createAuditLog({ actor, action: 'PRIVACY_REQUEST_CREATED', entityType: 'privacy_request', entityId: row!.id, metadata: { kind: input.kind, verified: Boolean(input.userId) } }, db);
    return row!;
}

/** Erase account-only data. Financial and delivery evidence are deliberately not cascaded or rewritten. */
export async function eraseCustomerAccount(requestId: string, retentionReason: string, actor: AuthUser, db = sql) {
    const erase = async (tx: typeof sql) => {
        const [request] = await tx<PrivacyRequest[]>`SELECT * FROM privacy_requests WHERE id = ${requestId} FOR UPDATE`;
        if (!request || request.kind !== 'ERASURE' || !request.user_id || !request.identity_verified_at || ['COMPLETED', 'REJECTED'].includes(request.status)) {
            throw new BadRequestError('An open, identity-verified account erasure request is required. Guest requests need a manual record review.');
        }
        const [customer] = await tx`SELECT id, email FROM users WHERE id = ${request.user_id} AND role = ${USER_ROLE.CUSTOMER} FOR UPDATE`;
        if (!customer) throw new BadRequestError('Only customer accounts can be erased here.');
        const [active] = await tx`SELECT EXISTS(SELECT 1 FROM orders WHERE user_id = ${request.user_id} AND status IN (${ORDER_STATUS.PENDING},${ORDER_STATUS.CONFIRMED})) AS found`;
        if (active?.found) throw new BadRequestError('Resolve active orders first; record a restriction or retention decision on this request meanwhile.');
        const email = String(customer.email).toLowerCase();
        await tx`INSERT INTO email_preferences(id, email, recovery_opt_in, unsubscribed_at)
            VALUES (${randomUUID()}, ${email}, false, now()) ON CONFLICT(email) DO UPDATE SET recovery_opt_in = false, unsubscribed_at = now()`;
        await tx`DELETE FROM cart_recovery_snapshots WHERE user_id = ${request.user_id} OR email = ${email}`;
        await tx`DELETE FROM cart_items WHERE user_id = ${request.user_id}`;
        await tx`DELETE FROM refresh_tokens WHERE user_id = ${request.user_id}`;
        await tx`DELETE FROM user_invitations WHERE user_id = ${request.user_id}`;
        await tx`DELETE FROM password_reset_tokens WHERE user_id = ${request.user_id}`;
        await tx`DELETE FROM in_app_notifications WHERE recipient_id = ${request.user_id}`;
        await tx`UPDATE users SET full_name = 'Deleted customer', email = ${`deleted-${randomUUID()}@example.invalid`},
            password_hash = ${await Bun.password.hash(randomUUID())}, is_active = false WHERE id = ${request.user_id}`;
        const resolution = `Account credentials, profile, sessions and cart erased. Financial/delivery records and email suppression retained: ${retentionReason}`;
        await tx`UPDATE privacy_requests SET status = 'COMPLETED', resolution = ${resolution}, resolved_at = now() WHERE id = ${requestId}`;
        await createAuditLog({ actor, action: 'CUSTOMER_ACCOUNT_ERASED', entityType: 'privacy_request', entityId: requestId,
            metadata: { user_id: request.user_id, retention_reason: retentionReason } }, tx);
        return { erased: true, retained: 'Order, payment, delivery, privacy-request and suppression records. Review under the retention schedule and any legal hold.' };
    };
    return db === sql ? sql.begin(erase) : erase(db);
}

export async function accountingExport(month: string, dataset: AccountingDataset, actor: AuthUser, db = sql): Promise<AccountingExport> {
    const { start, end } = monthWindow(month);
    const exportData = async (tx: typeof sql) => {
        let rows: Record<string, unknown>[];
        let headers: string[];
        switch (dataset) {
            case 'orders':
                headers = ['order_number','public_id','order_source','status','payment_status','total_amount','shipping_cost','discount_amount','discount_code','paid_at','created_at'];
                rows = await tx`SELECT order_number, public_id, order_source, status, payment_status, total_amount, shipping_cost, discount_amount, discount_code, paid_at, created_at
                    FROM orders WHERE created_at >= ${start} AND created_at < ${end} ORDER BY created_at, id`; break;
            case 'items':
                headers = ['order_number','variant_sku','variant_size','variant_color','quantity','unit_price','subtotal'];
                rows = await tx`SELECT o.order_number, i.variant_sku, i.variant_size, i.variant_color, i.quantity, i.unit_price, i.subtotal
                    FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.created_at >= ${start} AND o.created_at < ${end} ORDER BY o.id, i.id`; break;
            case 'ledger':
            case 'refunds':
                headers = ['id','order_number','entry_type','direction','amount','currency','reference','created_at'];
                rows = await tx`SELECT l.id, o.order_number, l.entry_type, l.direction, l.amount, l.currency, l.reference, l.created_at
                    FROM payment_ledger_entries l LEFT JOIN orders o ON o.id = l.order_id
                    WHERE l.created_at >= ${start} AND l.created_at < ${end}
                        ${dataset === 'refunds' ? tx`AND l.entry_type = ${LEDGER_ENTRY.REFUND_ISSUED}` : tx``}
                    ORDER BY l.created_at, l.id`; break;
            case 'discounts':
                headers = ['order_number','discount_code','discount_amount','status','created_at'];
                rows = await tx`SELECT order_number, discount_code, discount_amount, status, created_at FROM orders
                    WHERE created_at >= ${start} AND created_at < ${end} AND discount_amount > 0 ORDER BY created_at, id`; break;
            case 'inventory':
                headers = ['id','sku','delta','reason','reference_id','created_by','created_at'];
                rows = await tx`SELECT m.id, v.sku, m.delta, m.reason, m.reference_id, m.created_by, m.created_at FROM inventory_movements m
                    JOIN product_variants v ON v.id = m.variant_id WHERE m.created_at >= ${start} AND m.created_at < ${end} ORDER BY m.created_at, m.id`; break;
            case 'acceptances':
                headers = ['order_number','policy_version','accepted_at'];
                rows = await tx`SELECT o.order_number, p.policy_version, p.accepted_at FROM order_policy_acceptances p JOIN orders o ON o.id = p.order_id
                    WHERE p.accepted_at >= ${start} AND p.accepted_at < ${end} ORDER BY p.accepted_at`; break;
        }
        const content = csv(rows, headers);
        const digest = createHash('sha256').update(content).digest('hex');
        const id = randomUUID();
        await tx`INSERT INTO compliance_export_records(id, actor_user_id, month, dataset, row_count, sha256)
            VALUES (${id}, ${Number(actor.sub)}, ${month}, ${dataset}, ${rows.length}, ${digest})`;
        await createAuditLog({ actor, action: 'ACCOUNTING_EXPORTED', entityType: 'compliance_export', entityId: id,
            metadata: { month, dataset, rows: rows.length, sha256: digest } }, tx);
        return { month, dataset, timezone: 'Africa/Nairobi', generated_at: new Date().toISOString(), row_count: rows.length, sha256: digest, csv: content };
    };
    return db === sql ? sql.begin(exportData) as Promise<AccountingExport> : exportData(db);
}
