import { Hono } from 'hono';
import { ordersHandlers } from './orders.handlers';
import { optionalAuth, requireAuth, requireRole } from '../../middleware/auth.middleware';
import { USER_ROLE } from 'shared/dist';
import type { AppEnv } from '@server/lib/hono';

const ordersRoutes = new Hono<AppEnv>();

ordersRoutes.get('/stats', requireAuth, requireRole(USER_ROLE.ADMIN), ordersHandlers.stats);
ordersRoutes.get('/walk-in/catalog', requireAuth, requireRole(USER_ROLE.ADMIN, USER_ROLE.MANAGER), ordersHandlers.walkInCatalog);
ordersRoutes.post('/walk-in', requireAuth, requireRole(USER_ROLE.ADMIN, USER_ROLE.MANAGER), ordersHandlers.createWalkInSale);
ordersRoutes.get('/', requireAuth, ordersHandlers.list);
ordersRoutes.post('/', optionalAuth, ordersHandlers.create);
ordersRoutes.post('/:id/confirm-received', ordersHandlers.confirmReceived);
ordersRoutes.get('/:id/receipt', requireAuth, ordersHandlers.receipt);
ordersRoutes.get('/:id', requireAuth, ordersHandlers.get);
ordersRoutes.post('/:id/cancel', requireAuth, ordersHandlers.cancel);

// Status/payment changes are admin-only. Managers can view orders.
ordersRoutes.patch('/:id/status', requireAuth, requireRole(USER_ROLE.ADMIN), ordersHandlers.updateStatus);
ordersRoutes.patch('/:id/confirm-payment', requireAuth, requireRole(USER_ROLE.ADMIN), ordersHandlers.confirmPayment);

export default ordersRoutes;
