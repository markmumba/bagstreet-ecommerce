import type { Next } from 'hono';
import { verify } from 'hono/jwt';
import { env } from '../config/env';
import { ForbiddenError, UnauthorizedError } from '@server/lib/errors';
import type { AppContext, AuthUser } from '@server/lib/hono';
import { getRequiredUser } from '@server/lib/hono';
import { sql } from '../lib/db';

export async function getActiveAuthUser(payload: AuthUser): Promise<AuthUser | undefined> {
    if (typeof payload.sub !== 'string' || !/^\d+$/.test(payload.sub)) return;
    const [row] = await sql<{ id: number; email: string; role: string }[]>`
        SELECT id, email, role FROM users WHERE id = ${Number(payload.sub)} AND is_active = true
    `;
    // Database roles are authoritative, including after dismissal, demotion or account erasure.
    return row ? { ...payload, sub: String(row.id), email: row.email, role: row.role } : undefined;
}

export async function requireAuth(c: AppContext, next: Next) {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        throw new UnauthorizedError('Missing or invalid authorization header');
    }

    const token = authHeader.slice(7);

    let payload: AuthUser;
    try {
        payload = await verify(token, env.JWT_SECRET, 'HS256') as unknown as AuthUser;
    } catch {
        throw new UnauthorizedError('Invalid or expired access token');
    }

    const user = await getActiveAuthUser(payload);
    if (!user) throw new UnauthorizedError('This account is inactive');
    c.set('user', user);

    await next();
}

export async function optionalAuth(c: AppContext, next: Next) {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        await next();
        return;
    }

    const token = authHeader.slice(7);

    let payload: AuthUser | undefined;
    try {
        payload = await verify(token, env.JWT_SECRET, 'HS256') as unknown as AuthUser;
    } catch {
        // Guest-capable routes should continue without auth when a stale token is present.
    }
    if (payload) c.set('user', await getActiveAuthUser(payload));

    await next();
}

export function requireRole(...roles: string[]) {
    return async (c: AppContext, next: Next) => {
        const user = getRequiredUser(c);
        if (!roles.includes(user.role)) {
            throw new ForbiddenError('Insufficient permissions');
        }
        await next();
    };
}
