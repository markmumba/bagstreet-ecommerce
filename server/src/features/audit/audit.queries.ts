import { sql } from '../../lib/db';

export interface AuditLogRow {
    id: string;
    actor_user_id: number | null;
    actor_email: string | null;
    actor_role: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    before_state: unknown;
    after_state: unknown;
    metadata: unknown;
    ip_address: string | null;
    user_agent: string | null;
    created_at: string;
}

export const auditQueries = {
    list: async (params: {
        page: number;
        limit: number;
        action?: string | null;
        entityType?: string | null;
        entityId?: string | null;
        actorUserId?: number | null;
    }): Promise<AuditLogRow[]> => {
        const offset = (params.page - 1) * params.limit;
        return await sql<AuditLogRow[]>`
            SELECT *
            FROM audit_logs
            WHERE (${params.action ?? null}::text IS NULL OR action = ${params.action ?? null}::text)
              AND (${params.entityType ?? null}::text IS NULL OR entity_type = ${params.entityType ?? null}::text)
              AND (${params.entityId ?? null}::text IS NULL OR entity_id = ${params.entityId ?? null}::text)
              AND (${params.actorUserId ?? null}::int IS NULL OR actor_user_id = ${params.actorUserId ?? null}::int)
            ORDER BY created_at DESC
            LIMIT ${params.limit} OFFSET ${offset}
        `;
    },

    count: async (params: {
        action?: string | null;
        entityType?: string | null;
        entityId?: string | null;
        actorUserId?: number | null;
    }): Promise<number> => {
        const [row] = await sql<{ count: string }[]>`
            SELECT COUNT(*) as count
            FROM audit_logs
            WHERE (${params.action ?? null}::text IS NULL OR action = ${params.action ?? null}::text)
              AND (${params.entityType ?? null}::text IS NULL OR entity_type = ${params.entityType ?? null}::text)
              AND (${params.entityId ?? null}::text IS NULL OR entity_id = ${params.entityId ?? null}::text)
              AND (${params.actorUserId ?? null}::int IS NULL OR actor_user_id = ${params.actorUserId ?? null}::int)
        `;
        return Number(row?.count ?? 0);
    },
};
