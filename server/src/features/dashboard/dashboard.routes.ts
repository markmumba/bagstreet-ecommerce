import { Hono } from 'hono';
import type { AppEnv } from '@server/lib/hono';
import { requireAuth, requireRole } from '../../middleware/auth.middleware';
import { USER_ROLE } from 'shared/dist';
import { dashboardHandlers } from './dashboard.handlers';

const dashboardRoutes = new Hono<AppEnv>();

dashboardRoutes.get(
    '/overview',
    requireAuth,
    requireRole(USER_ROLE.ADMIN),
    dashboardHandlers.overview
);

export default dashboardRoutes;
