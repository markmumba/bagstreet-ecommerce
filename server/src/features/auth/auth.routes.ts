import { Hono } from 'hono';
import { authHandlers } from './auth.handlers';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireTrustedOrigin } from '../../middleware/origin-guard';
import type { AppEnv } from '@server/lib/hono';

const authRoutes = new Hono<AppEnv>();

// Login, refresh, logout and invite acceptance read or set the refresh cookie,
// so every write here must come from one of our own apps (blocks login CSRF).
authRoutes.use('*', requireTrustedOrigin);

authRoutes.post('/register', authHandlers.register);
authRoutes.post('/login', authHandlers.login);
authRoutes.post('/refresh', authHandlers.refresh);
authRoutes.post('/logout', authHandlers.logout);
authRoutes.post('/accept-invite', authHandlers.acceptInvite);
authRoutes.post('/verify-invite', authHandlers.verifyInvite);
authRoutes.post('/forgot-password', authHandlers.forgotPassword);
authRoutes.post('/reset-password', authHandlers.resetPassword);
authRoutes.get('/me', requireAuth, authHandlers.me);
authRoutes.patch('/profile', requireAuth, authHandlers.updateProfile);

export default authRoutes;
