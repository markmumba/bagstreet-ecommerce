import { Hono } from 'hono';
import { ordersHandlers } from './orders.handlers';
import { optionalAuth, requireAuth, requireRole } from '../../middleware/auth.middleware';
import { USER_ROLE } from 'shared/dist';

const ordersRoutes = new Hono();

ordersRoutes.get('/stats', requireAuth, requireRole(USER_ROLE.ADMIN, USER_ROLE.MANAGER), ordersHandlers.stats);
ordersRoutes.get('/', requireAuth, ordersHandlers.list);
ordersRoutes.post('/', optionalAuth, ordersHandlers.create);
ordersRoutes.get('/:id', requireAuth, ordersHandlers.get);
ordersRoutes.post('/:id/cancel', requireAuth, ordersHandlers.cancel);

// Status updates restricted to admin/manager
ordersRoutes.patch('/:id/status', requireAuth, requireRole(USER_ROLE.ADMIN, USER_ROLE.MANAGER), ordersHandlers.updateStatus);
ordersRoutes.patch('/:id/confirm-payment', requireAuth, requireRole(USER_ROLE.ADMIN, USER_ROLE.MANAGER), ordersHandlers.confirmPayment);

export default ordersRoutes;
