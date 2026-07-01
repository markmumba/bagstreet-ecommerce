import { Hono } from 'hono';
import { shippingHandlers } from './shipping.handlers';
import { requireAuth, requireRole } from '../../middleware/auth.middleware';
import { USER_ROLE } from 'shared/dist';
import type { AppEnv } from '@server/lib/hono';

const shippingRoutes = new Hono<AppEnv>();

// Public: active locations for storefront checkout
shippingRoutes.get('/', shippingHandlers.listActive);

// Admin only
shippingRoutes.get('/all', requireAuth, requireRole(USER_ROLE.ADMIN), shippingHandlers.listAll);
shippingRoutes.post('/import', requireAuth, requireRole(USER_ROLE.ADMIN), shippingHandlers.importCsv);
shippingRoutes.post('/', requireAuth, requireRole(USER_ROLE.ADMIN), shippingHandlers.create);
shippingRoutes.put('/:id', requireAuth, requireRole(USER_ROLE.ADMIN), shippingHandlers.update);
shippingRoutes.delete('/:id', requireAuth, requireRole(USER_ROLE.ADMIN), shippingHandlers.delete);

export default shippingRoutes;
