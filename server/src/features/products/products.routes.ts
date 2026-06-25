import { Hono } from "hono";
import { productsHandlers } from "./products.handlers";
import { variantsHandlers } from "./variants.handlers";

const productsRoutes = new Hono();

productsRoutes.get('/', productsHandlers.list);
productsRoutes.get('/:id', productsHandlers.get);
productsRoutes.post('/', productsHandlers.create);
productsRoutes.put('/:id', productsHandlers.update);
productsRoutes.delete('/:id', productsHandlers.delete);

// Variant sub-routes
productsRoutes.get('/:id/variants', variantsHandlers.list);
productsRoutes.post('/:id/variants', variantsHandlers.create);
productsRoutes.put('/:id/variants/:vid', variantsHandlers.update);
productsRoutes.delete('/:id/variants/:vid', variantsHandlers.delete);
productsRoutes.post('/:id/variants/:vid/stock', variantsHandlers.adjustStock);
productsRoutes.get('/:id/variants/:vid/stock/history', variantsHandlers.stockHistory);

export default productsRoutes;
