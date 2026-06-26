import { Hono } from 'hono';
import { shippingHandlers } from './shipping.handlers';
import { requireAuth, requireRole } from '../../middleware/auth.middleware';
import { USER_ROLE } from 'shared/dist';

const shippingRoutes = new Hono();

// Public: active locations for storefront checkout
shippingRoutes.get('/', shippingHandlers.listActive);

// Admin/Manager only
shippingRoutes.get('/all', requireAuth, requireRole(USER_ROLE.ADMIN, USER_ROLE.MANAGER), shippingHandlers.listAll);
shippingRoutes.post('/', requireAuth, requireRole(USER_ROLE.ADMIN, USER_ROLE.MANAGER), shippingHandlers.create);
shippingRoutes.put('/:id', requireAuth, requireRole(USER_ROLE.ADMIN, USER_ROLE.MANAGER), shippingHandlers.update);
shippingRoutes.delete('/:id', requireAuth, requireRole(USER_ROLE.ADMIN, USER_ROLE.MANAGER), shippingHandlers.delete);

export default shippingRoutes;
