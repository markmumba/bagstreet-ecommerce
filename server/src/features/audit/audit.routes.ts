import { Hono } from 'hono';
import type { AppEnv } from '@server/lib/hono';
import { requireAuth, requireRole } from '../../middleware/auth.middleware';
import { USER_ROLE } from 'shared/dist';
import { auditHandlers } from './audit.handlers';

const auditRoutes = new Hono<AppEnv>();

auditRoutes.get('/', requireAuth, requireRole(USER_ROLE.ADMIN), auditHandlers.list);

export default auditRoutes;
