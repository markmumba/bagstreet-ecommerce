import type { Context, Next } from 'hono';
import { verify } from 'hono/jwt';
import { env } from '../config/env';
import { ForbiddenError, UnauthorizedError } from '@server/lib/errors';

interface JWTPayload {
    sub: string;
    email: string;
    role: string;
    iat: number;
    exp: number;
}

export async function requireAuth(c: Context, next: Next) {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        throw new UnauthorizedError('Missing or invalid authorization header');
    }

    const token = authHeader.slice(7);

    try {
        const payload = await verify(token, env.JWT_SECRET) as unknown as JWTPayload;
        c.set('user', payload);
    } catch {
        throw new UnauthorizedError('Invalid or expired access token');
    }

    await next();
}

export function requireRole(...roles: string[]) {
    return async (c: Context, next: Next) => {
        const user = c.get('user') as JWTPayload;
        if (!roles.includes(user.role)) {
            throw new ForbiddenError('Insufficient permissions');
        }
        await next();
    };
}
