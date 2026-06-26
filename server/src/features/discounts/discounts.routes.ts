import { Hono } from 'hono';
import { discountsHandlers } from './discounts.handlers';
import { requireAuth, requireRole } from '../../middleware/auth.middleware';
import { USER_ROLE } from 'shared/dist';

const discountsRoutes = new Hono();

discountsRoutes.get('/validate', discountsHandlers.validate);
discountsRoutes.get('/', requireAuth, requireRole(USER_ROLE.ADMIN, USER_ROLE.MANAGER), discountsHandlers.list);
discountsRoutes.post('/', requireAuth, requireRole(USER_ROLE.ADMIN, USER_ROLE.MANAGER), discountsHandlers.create);
discountsRoutes.put('/:id', requireAuth, requireRole(USER_ROLE.ADMIN, USER_ROLE.MANAGER), discountsHandlers.update);
discountsRoutes.delete('/:id', requireAuth, requireRole(USER_ROLE.ADMIN, USER_ROLE.MANAGER), discountsHandlers.deactivate);

export default discountsRoutes;
