import { Hono } from 'hono';
import { paymentsHandlers } from './payments.handlers';
import { requireAuth } from '../../middleware/auth.middleware';

const paymentsRoutes = new Hono();

paymentsRoutes.post('/mpesa/initiate', requireAuth, paymentsHandlers.initiate);
paymentsRoutes.post('/mpesa/callback', paymentsHandlers.callback);

export default paymentsRoutes;
