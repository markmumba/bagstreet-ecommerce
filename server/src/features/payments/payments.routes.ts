import { Hono } from 'hono';
import { paymentsHandlers } from './payments.handlers';
import { optionalAuth, requireAuth } from '../../middleware/auth.middleware';

const paymentsRoutes = new Hono();

paymentsRoutes.post('/mpesa/initiate', requireAuth, paymentsHandlers.initiate);
paymentsRoutes.post('/mpesa/resend', optionalAuth, paymentsHandlers.resend);
paymentsRoutes.post('/mpesa/status', optionalAuth, paymentsHandlers.status);
paymentsRoutes.post('/mpesa/callback', paymentsHandlers.callback);
paymentsRoutes.post('/mpesa/c2b/callback', paymentsHandlers.c2bCallback);

export default paymentsRoutes;
