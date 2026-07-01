import { Hono } from 'hono';
import { userHandlers } from './user.handlers';
import type { AppEnv } from '@server/lib/hono';

const userRoutes = new Hono<AppEnv>();

userRoutes.get('/', userHandlers.list);
userRoutes.get('/:id', userHandlers.get);
userRoutes.post('/', userHandlers.create);
userRoutes.patch('/:id', userHandlers.update);
userRoutes.delete('/:id', userHandlers.delete);

export default userRoutes;
