import { Hono } from "hono";
import { categoriesHandlers } from "./categories.handlers";
import type { AppEnv } from '@server/lib/hono';
import { requireAuth, requireRole } from "../../middleware/auth.middleware";
import { USER_ROLE } from "shared/dist";


export const categoriesRoutes = new Hono<AppEnv>();
const requireAdmin = [requireAuth, requireRole(USER_ROLE.ADMIN)] as const;

categoriesRoutes.get('/', categoriesHandlers.list);
categoriesRoutes.get('/tree', categoriesHandlers.tree);
categoriesRoutes.post('/import', ...requireAdmin, categoriesHandlers.importCsv);
categoriesRoutes.get('/:id', categoriesHandlers.get);
categoriesRoutes.post('/', ...requireAdmin, categoriesHandlers.create);
categoriesRoutes.put('/:id', ...requireAdmin, categoriesHandlers.update);
categoriesRoutes.delete('/:id', ...requireAdmin, categoriesHandlers.delete);
