import { Hono } from 'hono';
import { settingsHandlers } from './settings.handlers';
import { requireAuth, requireRole } from '../../middleware/auth.middleware';
import { USER_ROLE } from 'shared/dist';

const settingsRoutes = new Hono();

settingsRoutes.get('/free-delivery-threshold', settingsHandlers.getFreeDeliveryThreshold);
settingsRoutes.put(
    '/free-delivery-threshold',
    requireAuth,
    requireRole(USER_ROLE.ADMIN, USER_ROLE.MANAGER),
    settingsHandlers.updateFreeDeliveryThreshold
);

export default settingsRoutes;
