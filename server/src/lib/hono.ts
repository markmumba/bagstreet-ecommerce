import type { Context } from 'hono';
import { UnauthorizedError } from './errors';

export type AuthUser = {
    sub: string;
    email: string;
    role: string;
    iat?: number;
    exp?: number;
};

export type AppEnv = {
    Variables: {
        user: AuthUser | undefined;
    };
};

export type AppContext = Context<AppEnv>;

export function getOptionalUser(c: AppContext): AuthUser | null {
    return c.get('user') ?? null;
}

export function getRequiredUser(c: AppContext): AuthUser {
    const user = c.get('user');
    if (!user) {
        throw new UnauthorizedError('Authentication required');
    }
    return user;
}
