import { Hono } from 'hono';
import type { AppEnv } from '@server/lib/hono';
import { storefrontHandlers } from './storefront.handlers';

const storefrontRoutes = new Hono<AppEnv>();

storefrontRoutes.get('/home', storefrontHandlers.home);

export default storefrontRoutes;
