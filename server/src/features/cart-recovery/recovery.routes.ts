import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv, AppContext } from '../../lib/hono';
import { getOptionalUser, getRequiredUser } from '../../lib/hono';
import { optionalAuth, requireAuth, requireRole } from '../../middleware/auth.middleware';
import { rateLimit } from '../../middleware/rate-limit.middleware';
import { BadRequestError, ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors';
import { success } from '../../lib/response';
import { env } from '../../config/env';
import { sql } from '../../lib/db';
import { readJsonColumn } from '../../lib/json-column';
import { cartItemsSchema, mergeQuoteItems, toQuoteResponse } from '../quote/quote';
import { quoteOrder } from '../quote/quote.queries';
import { getRecoveryPreference, recoveryState, saveRecoverySnapshot, setRecoveryPreference, snapshotByToken, unsubscribeRecovery, type RecoverySnapshot } from './recovery.queries';
import { recoverySessionHash, rememberRecoverySource } from './recovery-session';
import { USER_ROLE, type CartQuoteRequestItem, type CartRecoveryResponse } from 'shared/dist';

const routes = new Hono<AppEnv>();
const syncSchema = cartItemsSchema.extend({ email: z.string().trim().email().max(254).optional(), consent: z.boolean().optional(), touch: z.boolean().optional() });
const tokenSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
const unsubscribeSchema = tokenSchema.extend({ id: z.string().uuid() });

routes.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    c.header('Referrer-Policy', 'no-referrer');
    // Cookie-bound writes must come from an allowed application origin.
    const origin = c.req.header('Origin');
    if (c.req.method !== 'GET' && origin && !env.CORS_ORIGIN.includes(origin)) throw new ForbiddenError();
    await next();
});
routes.use('*', rateLimit({ scope: 'cart-recovery', limit: 30, windowMs: 60_000 }));

routes.get('/preferences', requireAuth, requireRole(USER_ROLE.CUSTOMER), async c => {
    const preference = await getRecoveryPreference(getRequiredUser(c).email);
    return success(c, { enabled: env.CART_RECOVERY_ENABLED, recovery_opt_in: preference?.recovery_opt_in ?? false });
});
routes.patch('/preferences', requireAuth, requireRole(USER_ROLE.CUSTOMER), async c => {
    const body = z.object({ recovery_opt_in: z.boolean() }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw new ValidationError('Invalid email preference', body.error.errors);
    const preference = await setRecoveryPreference(getRequiredUser(c).email, body.data.recovery_opt_in);
    return success(c, { enabled: env.CART_RECOVERY_ENABLED, recovery_opt_in: preference.recovery_opt_in });
});

routes.post('/sync', optionalAuth, async c => {
    if (!env.CART_RECOVERY_ENABLED) return success(c, { saved: true });
    const body = syncSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw new ValidationError('Invalid saved bag', body.error.errors);
    const user = getOptionalUser(c);
    if (user && user.role !== USER_ROLE.CUSTOMER) throw new ForbiddenError();
    const sessionHash = recoverySessionHash(c, Boolean(user || (body.data.email && body.data.consent)));
    if (!sessionHash) return success(c, { saved: true });
    const [existing] = await sql<RecoverySnapshot[]>`SELECT * FROM cart_recovery_snapshots WHERE session_hash = ${sessionHash}`;
    const email = user?.email ?? body.data.email ?? (existing?.user_id == null ? existing?.email : undefined);
    if (!email) return success(c, { saved: true });
    const consent = user ? Boolean((await getRecoveryPreference(user.email))?.recovery_opt_in) : body.data.consent ?? Boolean(existing && existing.email === email);
    await saveRecoverySnapshot({ sessionHash, email, items: mergeQuoteItems(body.data.items).sort((a, b) => a.variant_id - b.variant_id), consent, touch: body.data.touch, userId: user ? Number(user.sub) : undefined });
    // Uniform response: this endpoint never discloses whether an email has an account or opted out.
    return success(c, { saved: true });
});

async function recover(c: AppContext, restore: boolean) {
    const parsed = tokenSchema.safeParse(restore ? await c.req.json().catch(() => null) : c.req.query());
    if (!parsed.success) throw new BadRequestError('This saved bag link is invalid or has expired.');
    const snapshot = await snapshotByToken(parsed.data.token);
    if (!snapshot) throw new NotFoundError('Saved bag');
    const state = await recoveryState(snapshot);
    if (restore && state !== 'ready') throw new BadRequestError('This checkout cannot be restarted. Check any existing payment first.');
    const items = readJsonColumn<CartQuoteRequestItem[]>(snapshot.items) ?? [];
    const response: CartRecoveryResponse = {
        state, expires_at: new Date(snapshot.expires_at).toISOString(), quote: state === 'ready' ? toQuoteResponse(await quoteOrder({ items })) : null,
    };
    // A GET (including email scanners) changes nothing. Restore stops this reminder series; a new bag can start another.
    if (restore) {
        if (!response.quote?.item_count) throw new BadRequestError('None of these items is currently available.');
        await sql`UPDATE cart_recovery_snapshots SET state = 'STOPPED', version = version + 1 WHERE id = ${snapshot.id} AND version = ${snapshot.version}`;
        if (snapshot.order_id) rememberRecoverySource(c, Number(snapshot.order_id), new Date(snapshot.expires_at).getTime());
    }
    return success(c, response);
}
routes.get('/bag', c => recover(c, false));
routes.post('/restore', c => recover(c, true));
routes.post('/unsubscribe', async c => {
    const body = unsubscribeSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success || !await unsubscribeRecovery(body.data.id, body.data.token)) throw new BadRequestError('This unsubscribe link is invalid.');
    return success(c, { unsubscribed: true });
});

export default routes;
