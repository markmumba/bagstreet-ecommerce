import { Hono } from 'hono';
import { discountsHandlers } from './discounts.handlers';
import { requireAuth, requireRole } from '../../middleware/auth.middleware';
import { USER_ROLE } from 'shared/dist';
import type { AppEnv } from '@server/lib/hono';

const discountsRoutes = new Hono<AppEnv>();

discountsRoutes.get('/validate', discountsHandlers.validate);
discountsRoutes.get('/', requireAuth, requireRole(USER_ROLE.ADMIN), discountsHandlers.list);
discountsRoutes.post('/', requireAuth, requireRole(USER_ROLE.ADMIN), discountsHandlers.create);
discountsRoutes.put('/:id', requireAuth, requireRole(USER_ROLE.ADMIN), discountsHandlers.update);
discountsRoutes.delete('/:id', requireAuth, requireRole(USER_ROLE.ADMIN), discountsHandlers.deactivate);

export default discountsRoutes;
