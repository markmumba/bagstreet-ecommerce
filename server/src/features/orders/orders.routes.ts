import { Hono } from 'hono';
import { ordersHandlers } from './orders.handlers';
import { requireAuth, requireRole } from '../../middleware/auth.middleware';
import { role } from 'shared/dist';

const ordersRoutes = new Hono();

// All order routes require authentication
ordersRoutes.use('/*', requireAuth);

ordersRoutes.get('/stats', requireRole(role.ADMIN, role.MANAGER), ordersHandlers.stats);
ordersRoutes.get('/', ordersHandlers.list);
ordersRoutes.get('/:id', ordersHandlers.get);
ordersRoutes.post('/', ordersHandlers.create);
ordersRoutes.post('/:id/cancel', ordersHandlers.cancel);

// Status updates restricted to admin/manager
ordersRoutes.patch('/:id/status', requireRole(role.ADMIN, role.MANAGER), ordersHandlers.updateStatus);

export default ordersRoutes;
