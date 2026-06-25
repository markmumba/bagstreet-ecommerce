import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { verify } from 'hono/jwt';
import { notificationsQueries, type NotificationRow } from './notifications.queries';
import { success, paginated } from '@server/lib/response';
import { UnauthorizedError, NotFoundError } from '@server/lib/errors';
import { addConnection, removeConnection } from '../../lib/sse';
import { env } from '../../config/env';

interface JWTPayload { sub: string; email: string; role: string; iat: number; exp: number }

function toNotifResponse(n: NotificationRow) {
    return {
        id: String(n.id),
        type: n.type,
        title: n.title,
        body: n.body,
        data: n.data as { link: string; order_id?: string } | null,
        is_read: n.is_read,
        created_at: n.created_at,
    };
}

export const notificationsHandlers = {
    stream: async (c: Context) => {
        const token = c.req.query('token');
        if (!token) throw new UnauthorizedError('Missing token');

        let payload: JWTPayload;
        try {
            payload = await verify(token, env.JWT_SECRET, 'HS256') as unknown as JWTPayload;
        } catch {
            throw new UnauthorizedError('Invalid or expired token');
        }

        const userId = Number(payload.sub);

        return streamSSE(c, async (stream) => {
            let closed = false;

            const sendFn = async (event: string, data: object) => {
                await stream.writeSSE({ event, data: JSON.stringify(data) });
            };

            addConnection(userId, sendFn);
            stream.onAbort(() => {
                closed = true;
                removeConnection(userId, sendFn);
            });

            const unreadCount = await notificationsQueries.countUnread(userId);
            await stream.writeSSE({ event: 'init', data: JSON.stringify({ unreadCount }) });

            while (!closed) {
                await stream.sleep(25000);
                if (closed) break;
                try {
                    await stream.writeSSE({ event: 'ping', data: '' });
                } catch {
                    break;
                }
            }

            removeConnection(userId, sendFn);
        });
    },

    list: async (c: Context) => {
        const user = c.get('user') as JWTPayload;
        const userId = Number(user.sub);
        const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
        const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') ?? '20', 10)));

        const [notifications, total] = await Promise.all([
            notificationsQueries.findByRecipient(userId, page, limit),
            notificationsQueries.countByRecipient(userId),
        ]);

        return paginated(c, notifications.map(toNotifResponse), page, limit, total);
    },

    markRead: async (c: Context) => {
        const user = c.get('user') as JWTPayload;
        const userId = Number(user.sub);
        const id = parseInt(c.req.param('id')!, 10);

        const updated = await notificationsQueries.markAsRead(id, userId);
        if (!updated) throw new NotFoundError('Notification', id);

        return success(c, { id: String(id) }, 'Marked as read');
    },

    markAllRead: async (c: Context) => {
        const user = c.get('user') as JWTPayload;
        const userId = Number(user.sub);
        await notificationsQueries.markAllRead(userId);
        return success(c, null, 'All notifications marked as read');
    },
};
