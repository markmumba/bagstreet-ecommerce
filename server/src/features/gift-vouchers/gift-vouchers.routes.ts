import { Hono } from 'hono';
import { USER_ROLE } from 'shared/dist';
import type { AppEnv } from '@server/lib/hono';
import { optionalAuth, requireAuth, requireRole } from '../../middleware/auth.middleware';
import { giftVouchersHandlers } from './gift-vouchers.handlers';

const giftVouchersRoutes = new Hono<AppEnv>();
const staff = [requireAuth, requireRole(USER_ROLE.ADMIN, USER_ROLE.MANAGER)] as const;
const admin = [requireAuth, requireRole(USER_ROLE.ADMIN)] as const;

// Selling and checking vouchers happens at the till (any staff); cancelling, correcting balances
// and the liability figure are admin only.
giftVouchersRoutes.get('/', ...staff, giftVouchersHandlers.list);
giftVouchersRoutes.post('/', ...staff, giftVouchersHandlers.issue);
giftVouchersRoutes.post('/lookup', ...staff, giftVouchersHandlers.lookup);
giftVouchersRoutes.get('/summary', ...admin, giftVouchersHandlers.summary);
giftVouchersRoutes.get('/:id', ...staff, giftVouchersHandlers.detail);
giftVouchersRoutes.post('/:id/void', ...admin, giftVouchersHandlers.void);
giftVouchersRoutes.post('/:id/adjust', ...admin, giftVouchersHandlers.adjust);
giftVouchersRoutes.post('/:id/replace-code', ...admin, giftVouchersHandlers.replaceCode);

// Storefront: buying a voucher and checking a balance (no account needed).
giftVouchersRoutes.post('/purchase', optionalAuth, giftVouchersHandlers.purchase);
giftVouchersRoutes.post('/balance', giftVouchersHandlers.balance);

export default giftVouchersRoutes;
