import { Hono } from 'hono';
import { paymentsHandlers } from './payments.handlers';
import { optionalAuth, requireAuth, requireRole } from '../../middleware/auth.middleware';
import { reconciliationHandlers } from './reconciliation.handlers';
import { USER_ROLE } from 'shared/dist';
import type { AppEnv } from '@server/lib/hono';

const paymentsRoutes = new Hono<AppEnv>();

paymentsRoutes.post('/pesapal/initiate', optionalAuth, paymentsHandlers.initiatePesapal);
paymentsRoutes.post('/pesapal/status', optionalAuth, paymentsHandlers.pesapalStatus);
paymentsRoutes.get('/pesapal/callback', paymentsHandlers.pesapalCallback);
paymentsRoutes.get('/pesapal/ipn', paymentsHandlers.pesapalIpn);
paymentsRoutes.post('/pesapal/ipn', paymentsHandlers.pesapalIpn);
paymentsRoutes.post('/dev-complete', optionalAuth, paymentsHandlers.completeDevPayment);

paymentsRoutes.get('/reconciliation', requireAuth, requireRole(USER_ROLE.ADMIN), reconciliationHandlers.report);
paymentsRoutes.post('/reconciliation/statement', requireAuth, requireRole(USER_ROLE.ADMIN), reconciliationHandlers.statement);

export default paymentsRoutes;
