import type { Next } from 'hono';
import { verify } from 'hono/jwt';
import { env } from '../config/env';
import { ForbiddenError, UnauthorizedError } from '@server/lib/errors';
import type { AppContext, AuthUser } from '@server/lib/hono';
import { getRequiredUser } from '@server/lib/hono';

export async function requireAuth(c: AppContext, next: Next) {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        throw new UnauthorizedError('Missing or invalid authorization header');
    }

    const token = authHeader.slice(7);

    try {
        const payload = await verify(token, env.JWT_SECRET, 'HS256') as unknown as AuthUser;
        c.set('user', payload);
    } catch {
        throw new UnauthorizedError('Invalid or expired access token');
    }

    await next();
}

export async function optionalAuth(c: AppContext, next: Next) {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        await next();
        return;
    }

    const token = authHeader.slice(7);

    try {
        const payload = await verify(token, env.JWT_SECRET, 'HS256') as unknown as AuthUser;
        c.set('user', payload);
    } catch {
        // Guest-capable routes should continue without auth when a stale token is present.
    }

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
