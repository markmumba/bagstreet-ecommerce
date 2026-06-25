import { Hono } from 'hono';
import { authHandlers } from './auth.handlers';
import { requireAuth } from '../../middleware/auth.middleware';

const authRoutes = new Hono();

authRoutes.post('/register', authHandlers.register);
authRoutes.post('/login', authHandlers.login);
authRoutes.post('/refresh', authHandlers.refresh);
authRoutes.post('/logout', authHandlers.logout);
authRoutes.post('/accept-invite', authHandlers.acceptInvite);
authRoutes.post('/forgot-password', authHandlers.forgotPassword);
authRoutes.post('/reset-password', authHandlers.resetPassword);
authRoutes.get('/me', requireAuth, authHandlers.me);
authRoutes.patch('/profile', requireAuth, authHandlers.updateProfile);

export default authRoutes;
