import { Hono } from 'hono';
import { cartHandlers } from './cart.handlers';
import { requireAuth } from '../../middleware/auth.middleware';
import type { AppEnv } from '@server/lib/hono';

const cartRoutes = new Hono<AppEnv>();

cartRoutes.use('/*', requireAuth);

cartRoutes.get('/', cartHandlers.get);
cartRoutes.post('/', cartHandlers.add);
cartRoutes.patch('/:variantId', cartHandlers.update);
cartRoutes.delete('/:variantId', cartHandlers.remove);
cartRoutes.delete('/', cartHandlers.clear);

export default cartRoutes;
