import { streamSSE } from 'hono/streaming';
import { verify } from 'hono/jwt';
import { notificationsQueries, type NotificationRow } from './notifications.queries';
import { success, paginated } from '@server/lib/response';
import { UnauthorizedError, NotFoundError } from '@server/lib/errors';
import { addConnection, removeConnection } from '../../lib/sse';
import { env } from '../../config/env';
import type { AppContext, AuthUser } from '@server/lib/hono';
import { getRequiredUser } from '@server/lib/hono';
import { getActiveAuthUser } from '../../middleware/auth.middleware';

function normalizeNotificationData(data: unknown): { link?: unknown; order_id?: string | number; variant_id?: string | number } | null {
    if (!data) return null;
    if (typeof data === 'string') {
        try {
            const parsed = JSON.parse(data);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch {
            return null;
        }
    }
    return typeof data === 'object' ? data as { link?: unknown; order_id?: string | number; variant_id?: string | number } : null;
}

function toNotifResponse(n: NotificationRow) {
    return {
        id: String(n.id),
        type: n.type,
        title: n.title,
        body: n.body,
        data: normalizeNotificationData(n.data),
        is_read: n.is_read,
        created_at: n.created_at,
    };
}

export const notificationsHandlers = {
    stream: async (c: AppContext) => {
        const token = c.req.query('token');
        if (!token) throw new UnauthorizedError('Missing token');

        let payload: AuthUser;
        try {
            payload = await verify(token, env.JWT_SECRET, 'HS256') as unknown as AuthUser;
        } catch {
            throw new UnauthorizedError('Invalid or expired token');
        }

        const user = await getActiveAuthUser(payload);
        if (!user) throw new UnauthorizedError('This account is inactive');
        const userId = Number(user.sub);

        return streamSSE(c, async (stream) => {
            let closed = false;
            const authorised = async () => {
                if (payload.exp != null && payload.exp <= Date.now() / 1000) return false;
                const current = await getActiveAuthUser(payload);
                return Boolean(current && current.role === user.role);
            };

            const sendFn = async (event: string, data: object) => {
                if (closed) return;
                try {
                    if (!await authorised()) {
                        closed = true;
                        removeConnection(userId, sendFn);
                        return;
                    }
                    await stream.writeSSE({ event, data: JSON.stringify(data) });
                } catch (error) {
                    closed = true;
                    removeConnection(userId, sendFn);
                    throw error;
                }
            };

            addConnection(userId, sendFn);
            stream.onAbort(() => {
                closed = true;
                removeConnection(userId, sendFn);
            });

            try {
                const unreadCount = await notificationsQueries.countUnread(userId);
                await sendFn('init', { unreadCount });

                while (!closed) {
                    await stream.sleep(25000);
                    if (closed) break;
                    if (!await authorised()) break;
                    await stream.writeSSE({ event: 'ping', data: '' });
                }
            } finally {
                closed = true;
                removeConnection(userId, sendFn);
            }
        });
    },

    list: async (c: AppContext) => {
        const user = getRequiredUser(c);
        const userId = Number(user.sub);
        const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
        const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') ?? '20', 10)));

        const [notifications, total] = await Promise.all([
            notificationsQueries.findByRecipient(userId, page, limit),
            notificationsQueries.countByRecipient(userId),
        ]);

        return paginated(c, notifications.map(toNotifResponse), page, limit, total);
    },

    markRead: async (c: AppContext) => {
        const user = getRequiredUser(c);
        const userId = Number(user.sub);
        const id = parseInt(c.req.param('id')!, 10);

        const updated = await notificationsQueries.markAsRead(id, userId);
        if (!updated) throw new NotFoundError('Notification', id);

        return success(c, { id: String(id) }, 'Marked as read');
    },

    markAllRead: async (c: AppContext) => {
        const user = getRequiredUser(c);
        const userId = Number(user.sub);
        await notificationsQueries.markAllRead(userId);
        return success(c, null, 'All notifications marked as read');
    },
};
