import { Hono } from 'hono';
import { authHandlers } from './auth.handlers';
import { requireAuth } from '../../middleware/auth.middleware';

const authRoutes = new Hono();

authRoutes.post('/register', authHandlers.register);
authRoutes.post('/login', authHandlers.login);
authRoutes.post('/refresh', authHandlers.refresh);
authRoutes.post('/logout', authHandlers.logout);
authRoutes.get('/me', requireAuth, authHandlers.me);

export default authRoutes;
