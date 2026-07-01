import type { AppContext, AuthUser } from '@server/lib/hono';
import { getOptionalUser } from '@server/lib/hono';
import { sql } from './db';

export type AuditAction =
    | 'CATEGORY_CREATED'
    | 'CATEGORY_UPDATED'
    | 'CATEGORY_DELETED'
    | 'PRODUCT_CREATED'
    | 'PRODUCT_UPDATED'
    | 'PRODUCT_SALE_UPDATED'
    | 'PRODUCT_DELETED'
    | 'PRODUCT_DEACTIVATED'
    | 'ORDER_STATUS_UPDATED'
    | 'ORDER_PAYMENT_CONFIRMED'
    | 'ORDER_PAYMENT_CAPTURED'
    | 'ORDER_PAYMENT_FAILED'
    | 'ORDER_RECEIVED_CONFIRMED'
    | 'WALK_IN_SALE_CREATED'
    | 'ORDER_HANDOVER_UPDATED'
    | 'USER_INVITED'
    | 'USER_UPDATED'
    | 'USER_DELETED'
    | 'SHIPPING_LOCATION_CREATED'
    | 'SHIPPING_LOCATION_UPDATED'
    | 'SHIPPING_LOCATION_DELETED'
    | 'DISCOUNT_CREATED'
    | 'DISCOUNT_UPDATED'
    | 'DISCOUNT_DEACTIVATED';

export async function createAuditLog(data: {
    actor?: AuthUser | null;
    action: AuditAction | string;
    entityType: string;
    entityId?: string | number | null;
    before?: unknown;
    after?: unknown;
    metadata?: unknown;
    ipAddress?: string | null;
    userAgent?: string | null;
}) {
    await sql`
        INSERT INTO audit_logs(
            actor_user_id,
            actor_email,
            actor_role,
            action,
            entity_type,
            entity_id,
            before_state,
            after_state,
            metadata,
            ip_address,
            user_agent
        )
        VALUES (
            ${data.actor?.sub ? Number(data.actor.sub) : null},
            ${data.actor?.email ?? null},
            ${data.actor?.role ?? null},
            ${data.action},
            ${data.entityType},
            ${data.entityId == null ? null : String(data.entityId)},
            ${data.before == null ? null : JSON.stringify(data.before)}::jsonb,
            ${data.after == null ? null : JSON.stringify(data.after)}::jsonb,
            ${data.metadata == null ? null : JSON.stringify(data.metadata)}::jsonb,
            ${data.ipAddress ?? null},
            ${data.userAgent ?? null}
        )
    `;
}

export async function auditFromContext(c: AppContext, data: {
    action: AuditAction | string;
    entityType: string;
    entityId?: string | number | null;
    before?: unknown;
    after?: unknown;
    metadata?: unknown;
}) {
    await createAuditLog({
        actor: getOptionalUser(c),
        ipAddress: c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? null,
        userAgent: c.req.header('user-agent') ?? null,
        ...data,
    });
}
