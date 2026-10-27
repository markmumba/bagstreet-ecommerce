import { Hono } from 'hono';
import { paymentsHandlers } from './payments.handlers';
import { optionalAuth, requireAuth, requireRole } from '../../middleware/auth.middleware';
import { reconciliationHandlers } from './reconciliation.handlers';
import { USER_ROLE } from 'shared/dist';
import type { AppEnv } from '@server/lib/hono';

const paymentsRoutes = new Hono<AppEnv>();

paymentsRoutes.post('/initiate', optionalAuth, paymentsHandlers.initiatePayment);
paymentsRoutes.post('/status', optionalAuth, paymentsHandlers.paymentStatus);
paymentsRoutes.post('/mpesa/callback/:secret?', paymentsHandlers.mpesaCallback);

paymentsRoutes.get('/reconciliation', requireAuth, requireRole(USER_ROLE.ADMIN), reconciliationHandlers.report);
paymentsRoutes.post('/reconciliation/statement', requireAuth, requireRole(USER_ROLE.ADMIN), reconciliationHandlers.statement);

export default paymentsRoutes;
