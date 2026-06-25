import { Hono } from 'hono';
import { shippingHandlers } from './shipping.handlers';
import { requireAuth, requireRole } from '../../middleware/auth.middleware';
import { role } from 'shared/dist';

const shippingRoutes = new Hono();

// Public: active locations for storefront checkout
shippingRoutes.get('/', shippingHandlers.listActive);

// Admin/Manager only
shippingRoutes.get('/all', requireAuth, requireRole(role.ADMIN, role.MANAGER), shippingHandlers.listAll);
shippingRoutes.post('/', requireAuth, requireRole(role.ADMIN, role.MANAGER), shippingHandlers.create);
shippingRoutes.put('/:id', requireAuth, requireRole(role.ADMIN, role.MANAGER), shippingHandlers.update);
shippingRoutes.delete('/:id', requireAuth, requireRole(role.ADMIN, role.MANAGER), shippingHandlers.delete);

export default shippingRoutes;
