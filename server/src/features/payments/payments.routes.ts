import { Hono } from 'hono';
import { paymentsHandlers } from './payments.handlers';
import { optionalAuth } from '../../middleware/auth.middleware';
import type { AppEnv } from '@server/lib/hono';

const paymentsRoutes = new Hono<AppEnv>();

paymentsRoutes.post('/pesapal/initiate', optionalAuth, paymentsHandlers.initiatePesapal);
paymentsRoutes.post('/pesapal/status', optionalAuth, paymentsHandlers.pesapalStatus);
paymentsRoutes.get('/pesapal/callback', paymentsHandlers.pesapalCallback);
paymentsRoutes.get('/pesapal/ipn', paymentsHandlers.pesapalIpn);
paymentsRoutes.post('/pesapal/ipn', paymentsHandlers.pesapalIpn);
paymentsRoutes.post('/dev-complete', optionalAuth, paymentsHandlers.completeDevPayment);

export default paymentsRoutes;
