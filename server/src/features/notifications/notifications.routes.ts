import { Hono } from 'hono';
import { requireAuth } from '../../middleware/auth.middleware';
import { notificationsHandlers } from './notifications.handlers';
import type { AppEnv } from '@server/lib/hono';

const notificationsRoutes = new Hono<AppEnv>();

// SSE stream — auth via query token (EventSource cannot send headers)
notificationsRoutes.get('/stream', notificationsHandlers.stream);

notificationsRoutes.get('/', requireAuth, notificationsHandlers.list);
notificationsRoutes.patch('/read-all', requireAuth, notificationsHandlers.markAllRead);
notificationsRoutes.patch('/:id/read', requireAuth, notificationsHandlers.markRead);

export default notificationsRoutes;
