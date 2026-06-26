import { sql } from '../../lib/db';
import { USER_ROLE } from 'shared/dist';

export interface NotificationRow {
    id: number;
    recipient_id: number;
    type: string;
    title: string;
    body: string | null;
    data: Record<string, unknown> | null;
    is_read: boolean;
    created_at: string;
}

export const notificationsQueries = {
    findByRecipient: async (userId: number, page: number, limit: number): Promise<NotificationRow[]> => {
        const offset = (page - 1) * limit;
        return await sql<NotificationRow[]>`
            SELECT * FROM in_app_notifications
            WHERE recipient_id = ${userId}
            ORDER BY created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `;
    },

    countByRecipient: async (userId: number): Promise<number> => {
        const [result] = await sql<[{ count: string }]>`
            SELECT COUNT(*) as count FROM in_app_notifications WHERE recipient_id = ${userId}
        `;
        return parseInt(result.count, 10);
    },

    countUnread: async (userId: number): Promise<number> => {
        const [result] = await sql<[{ count: string }]>`
            SELECT COUNT(*) as count FROM in_app_notifications
            WHERE recipient_id = ${userId} AND is_read = false
        `;
        return parseInt(result.count, 10);
    },

    markAsRead: async (id: number, userId: number): Promise<boolean> => {
        const [row] = await sql<{ id: number }[]>`
            UPDATE in_app_notifications SET is_read = true
            WHERE id = ${id} AND recipient_id = ${userId}
            RETURNING id
        `;
        return !!row;
    },

    markAllRead: async (userId: number): Promise<void> => {
        await sql`
            UPDATE in_app_notifications SET is_read = true WHERE recipient_id = ${userId}
        `;
    },

    create: async (
        rows: { recipient_id: number; type: string; title: string; body: string; data: object }[]
    ): Promise<NotificationRow[]> => {
        const result: NotificationRow[] = [];
        for (const row of rows) {
            const [notif] = await sql<NotificationRow[]>`
                INSERT INTO in_app_notifications(recipient_id, type, title, body, data)
                VALUES (${row.recipient_id}, ${row.type}, ${row.title}, ${row.body}, ${JSON.stringify(row.data)}::jsonb)
                RETURNING *
            `;
            if (notif) result.push(notif);
        }
        return result;
    },

    findAdminIds: async (): Promise<number[]> => {
        const rows = await sql<{ id: number }[]>`
            SELECT id FROM users WHERE role IN (${USER_ROLE.ADMIN}, ${USER_ROLE.MANAGER}) AND is_active = true
        `;
        return rows.map((r) => r.id);
    },
};
