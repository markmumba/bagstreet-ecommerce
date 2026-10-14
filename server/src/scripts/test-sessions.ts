/** Refresh-token rotation and reuse detection through the real auth routes. Disposable fixtures only. */
import { randomBytes, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { password as bunPassword } from 'bun';
import { USER_ROLE } from 'shared/dist';
import { sql, closeDatabase } from '../lib/db';
import { env } from '../config/env';
import type { AppEnv } from '../lib/hono';
import { errorHandler } from '../middleware/error-handler';
import authRoutes from '../features/auth/auth.routes';

if (env.NODE_ENV === 'production') throw new Error('Session fixtures must not run in production');

const email = `zz-session-${randomUUID()}@example.invalid`;
const password = `Test-only-${randomBytes(12).toString('hex')}`;
const results: [string, boolean][] = [];
const check = (name: string, ok: boolean) => { results.push([name, ok]); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); };

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route('/api/auth', authRoutes);

const COOKIE = 'bagstreet_storefront_refresh_token';
const headers = { 'Content-Type': 'application/json', 'X-Bagstreet-App': 'storefront' };

function refreshCookieOf(response: Response): string | undefined {
    for (const line of response.headers.getSetCookie()) {
        const [pair] = line.split(';');
        const [name, value] = pair!.split('=');
        if (name === COOKIE && value) return value;
    }
}

const refresh = (cookie: string) => app.request('/api/auth/refresh', { method: 'POST', headers: { ...headers, Cookie: `${COOKIE}=${cookie}` } });
const liveTokens = async (userId: number) => Number((await sql`SELECT count(*)::int AS n FROM refresh_tokens WHERE user_id = ${userId}`)[0].n);

let userId = 0;
try {
    const [user] = await sql`
        INSERT INTO users(email, full_name, password_hash, role, is_active)
        VALUES (${email}, 'ZZ Session', ${await bunPassword.hash(password)}, ${USER_ROLE.CUSTOMER}, true)
        RETURNING id
    `;
    userId = Number(user.id);

    const login = await app.request('/api/auth/login', { method: 'POST', headers, body: JSON.stringify({ email, password }) });
    const first = refreshCookieOf(login);
    check('login sets an HttpOnly refresh cookie', login.status === 200 && Boolean(first)
        && login.headers.getSetCookie().some((line) => line.startsWith(`${COOKIE}=`) && line.includes('HttpOnly')));

    const rotated = await refresh(first!);
    const second = refreshCookieOf(rotated);
    const body = await rotated.json() as { data?: { access_token?: string } };
    check('first refresh returns an access token and a new cookie', rotated.status === 200 && Boolean(body.data?.access_token) && Boolean(second) && second !== first);

    const twoTabs = await refresh(first!);
    check('the same token again within the grace period still works (two tabs)', twoTabs.status === 200 && Boolean(refreshCookieOf(twoTabs)));

    const third = refreshCookieOf(await refresh(second!));
    check('the new token works once', Boolean(third));

    // Pretend the first token was used long ago: presenting it now is a stolen copy.
    await sql`UPDATE refresh_tokens SET used_at = used_at - interval '10 minutes' WHERE user_id = ${userId} AND used_at IS NOT NULL`;
    const stolen = await refresh(first!);
    check('a used token presented later is refused', stolen.status === 401);
    check('reuse signs out every session of the account', await liveTokens(userId) === 0);
    check('even the newest token no longer works', (await refresh(third!)).status === 401);

    const [audit] = await sql`SELECT count(*)::int AS n FROM audit_logs WHERE action = 'SESSION_TOKEN_REUSED' AND entity_id = ${String(userId)}`;
    check('reuse is recorded in the audit log', Number(audit.n) === 1);

    const unknown = await refresh(randomBytes(32).toString('hex'));
    check('an unknown token is refused', unknown.status === 401);

    const again = refreshCookieOf(await app.request('/api/auth/login', { method: 'POST', headers, body: JSON.stringify({ email, password }) }));
    await app.request('/api/auth/logout', { method: 'POST', headers: { ...headers, Cookie: `${COOKIE}=${again}` } });
    check('logout ends the session', (await refresh(again!)).status === 401);
} finally {
    if (userId) {
        await sql`DELETE FROM audit_logs WHERE entity_type = 'user' AND entity_id = ${String(userId)}`;
        await sql`DELETE FROM refresh_tokens WHERE user_id = ${userId}`;
        await sql`DELETE FROM users WHERE id = ${userId}`;
    }
    await closeDatabase();
}

const failed = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} session checks passed`);
if (failed) process.exit(1);
