import { Hono } from 'hono';
import { USER_ROLE } from 'shared/dist';
import type { AppEnv } from '@server/lib/hono';
import { requireAuth, requireRole } from '../../middleware/auth.middleware';
import { recommendationsHandlers as h } from './recommendations.handlers';

const recommendationsRoutes = new Hono<AppEnv>();
const admin = [requireAuth, requireRole(USER_ROLE.ADMIN)] as const;

// Storefront.
recommendationsRoutes.get('/products/:id', h.forProduct);
recommendationsRoutes.get('/bag', h.forBag);
recommendationsRoutes.get('/viewed', h.viewed);
recommendationsRoutes.post('/events', h.event);

// Admin: what goes with what, and whether recommendations get used.
recommendationsRoutes.get('/admin/stats', ...admin, h.stats);
recommendationsRoutes.get('/admin/products/:id/pairings', ...admin, h.productPairings);
recommendationsRoutes.put('/admin/products/:id/pairings', ...admin, h.setProductPairings);
recommendationsRoutes.get('/admin/categories/pairings', ...admin, h.categoryPairings);
recommendationsRoutes.put('/admin/categories/pairings', ...admin, h.setCategoryPairings);

export default recommendationsRoutes;
