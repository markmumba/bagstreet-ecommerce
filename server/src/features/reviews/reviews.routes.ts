import { Hono } from 'hono';
import { USER_ROLE } from 'shared/dist';
import type { AppEnv } from '@server/lib/hono';
import { optionalAuth, requireAuth, requireRole } from '../../middleware/auth.middleware';
import { reviewsHandlers } from './reviews.handlers';

const reviewsRoutes = new Hono<AppEnv>();
const admin = [requireAuth, requireRole(USER_ROLE.ADMIN)] as const;

// Storefront: reading a product's reviews, and a customer reviewing their own order.
reviewsRoutes.get('/products/:productId', reviewsHandlers.forProduct);
reviewsRoutes.get('/order', optionalAuth, reviewsHandlers.forOrder);
reviewsRoutes.put('/order/:productId', optionalAuth, reviewsHandlers.upsert);
reviewsRoutes.delete('/order/:productId', optionalAuth, reviewsHandlers.remove);

// Admin moderation.
reviewsRoutes.get('/admin', ...admin, reviewsHandlers.adminList);
reviewsRoutes.get('/admin/counts', ...admin, reviewsHandlers.adminCounts);
reviewsRoutes.post('/admin/:id/approve', ...admin, reviewsHandlers.approve);
reviewsRoutes.post('/admin/:id/reject', ...admin, reviewsHandlers.reject);
reviewsRoutes.put('/admin/:id/reply', ...admin, reviewsHandlers.reply);

export default reviewsRoutes;
