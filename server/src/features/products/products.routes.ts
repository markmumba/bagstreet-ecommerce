import { Hono } from "hono";
import { productsHandlers } from "./products.handlers";

const productsRoutes = new Hono();

productsRoutes.get('/', productsHandlers.list);
productsRoutes.get('/:id', productsHandlers.get);
productsRoutes.post('/', productsHandlers.create);
productsRoutes.put('/:id', productsHandlers.update);
productsRoutes.delete('/:id', productsHandlers.delete);

export default productsRoutes;