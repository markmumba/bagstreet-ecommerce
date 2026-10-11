import { Hono } from 'hono';
import type { AppEnv } from '@server/lib/hono';
import { storefrontHandlers } from './storefront.handlers';
import { optionalAuth } from '../../middleware/auth.middleware';

const storefrontRoutes = new Hono<AppEnv>();

storefrontRoutes.get('/home', storefrontHandlers.home);
storefrontRoutes.get('/catalog', storefrontHandlers.catalog);
// optionalAuth: account-only discount codes need to know who is signed in.
storefrontRoutes.post('/cart/quote', optionalAuth, storefrontHandlers.cartQuote);

export default storefrontRoutes;
