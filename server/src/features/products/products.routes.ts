import { Hono } from "hono";
import { productsHandlers } from "./products.handlers";
import { variantsHandlers } from "./variants.handlers";
import { requireAuth, requireRole } from "../../middleware/auth.middleware";
import { USER_ROLE } from "shared/dist";
import type { AppEnv } from '@server/lib/hono';

const productsRoutes = new Hono<AppEnv>();
const requireAdmin = [requireAuth, requireRole(USER_ROLE.ADMIN)] as const;

productsRoutes.get('/', productsHandlers.list);
productsRoutes.get('/low-stock', ...requireAdmin, variantsHandlers.lowStock);
productsRoutes.get('/on-sale', productsHandlers.onSale);
productsRoutes.post('/import', ...requireAdmin, productsHandlers.importCsv);
productsRoutes.get('/:id', productsHandlers.get);
productsRoutes.post('/', ...requireAdmin, productsHandlers.create);
productsRoutes.put('/:id', ...requireAdmin, productsHandlers.update);
productsRoutes.patch('/:id/sale', ...requireAdmin, productsHandlers.setSale);
productsRoutes.delete('/:id', ...requireAdmin, productsHandlers.delete);

// Variant sub-routes
productsRoutes.get('/:id/variants', variantsHandlers.list);
productsRoutes.post('/:id/variants', ...requireAdmin, variantsHandlers.create);
productsRoutes.put('/:id/variants/:vid', ...requireAdmin, variantsHandlers.update);
productsRoutes.delete('/:id/variants/:vid', ...requireAdmin, variantsHandlers.delete);
productsRoutes.post('/:id/variants/:vid/stock', ...requireAdmin, variantsHandlers.adjustStock);
productsRoutes.get('/:id/variants/:vid/stock/history', ...requireAdmin, variantsHandlers.stockHistory);

export default productsRoutes;
