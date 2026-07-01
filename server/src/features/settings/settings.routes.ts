import { Hono } from 'hono';
import { settingsHandlers } from './settings.handlers';
import { requireAuth, requireRole } from '../../middleware/auth.middleware';
import { USER_ROLE } from 'shared/dist';
import type { AppEnv } from '@server/lib/hono';

const settingsRoutes = new Hono<AppEnv>();

settingsRoutes.get('/free-delivery-threshold', settingsHandlers.getFreeDeliveryThreshold);
settingsRoutes.get(
    '/order-handover',
    requireAuth,
    requireRole(USER_ROLE.ADMIN),
    settingsHandlers.getOrderHandover
);
settingsRoutes.put(
    '/free-delivery-threshold',
    requireAuth,
    requireRole(USER_ROLE.ADMIN),
    settingsHandlers.updateFreeDeliveryThreshold
);
settingsRoutes.put(
    '/order-handover',
    requireAuth,
    requireRole(USER_ROLE.ADMIN),
    settingsHandlers.updateOrderHandover
);

export default settingsRoutes;
