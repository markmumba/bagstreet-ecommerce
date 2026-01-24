import { Hono } from "hono";
import { categoriesHandlers } from "./categories.handlers";


export const categoriesRoutes = new Hono();
categoriesRoutes.get('/', categoriesHandlers.list);
categoriesRoutes.get('/:id', categoriesHandlers.get);
categoriesRoutes.post('/', categoriesHandlers.create);
categoriesRoutes.put('/:id', categoriesHandlers.update);
categoriesRoutes.delete('/:id', categoriesHandlers.delete);
