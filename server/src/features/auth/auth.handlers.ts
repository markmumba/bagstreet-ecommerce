import type { Context } from 'hono';
import { sign } from 'hono/jwt';
import { createHash, randomBytes } from 'crypto';
import { UsersQueries } from '../users/user.queries';
import { authQueries } from './auth.queries';
import { loginSchema, registerSchema, acceptInviteSchema } from './auth.schema';
import { env } from '../../config/env';
import { BadRequestError, ConflictError, InternalServerError, NotFoundError, UnauthorizedError, ValidationError } from '@server/lib/errors';
import { success } from '@server/lib/response';
import { password} from 'bun';
import {role} from "shared/dist"; 

const ACCESS_TOKEN_TTL = 15 * 60;          // 15 minutes in seconds
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

function hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
}

async function generateAccessToken(userId: number, email: string, role: string): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return sign(
        { sub: String(userId), email, role, iat: now, exp: now + ACCESS_TOKEN_TTL },
        env.JWT_SECRET,
        'HS256'
    );
}

function setRefreshCookie(c: Context, token: string) {
    const isProduction = env.NODE_ENV === 'production';
    c.header(
        'Set-Cookie',
        `refresh_token=${token}; HttpOnly; Path=/api/auth; SameSite=Lax; Max-Age=${REFRESH_TOKEN_TTL}${isProduction ? '; Secure' : ''}`
    );
}

function clearRefreshCookie(c: Context) {
    c.header(
        'Set-Cookie',
        `refresh_token=; HttpOnly; Path=/api/auth; SameSite=Lax; Max-Age=0`
    );
}

export const authHandlers = {

    login: async (c: Context) => {
        const body = await c.req.json();
        const validated = loginSchema.safeParse(body);

        if (!validated.success) {
            throw new ValidationError('Invalid credentials', validated.error.errors);
        }

        const user = await UsersQueries.findByEmail(validated.data.email);
        if (!user) throw new UnauthorizedError('Invalid email or password');

        if (!user.is_active) throw new UnauthorizedError('Account is not active');

        const passwordValid = await password.verify(validated.data.password, user.password_hash);
        if (!passwordValid) throw new UnauthorizedError('Invalid email or password');

        const accessToken = await generateAccessToken(Number(user.id), user.email, user.role);

        const rawRefreshToken = randomBytes(32).toString('hex');
        const tokenHash = hashToken(rawRefreshToken);
        const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL * 1000);
        await authQueries.saveRefreshToken(Number(user.id), tokenHash, expiresAt);

        setRefreshCookie(c, rawRefreshToken);

        return success(c, {
            access_token: accessToken,
            user: {
                id: String(user.id),
                email: user.email,
                full_name: user.full_name,
                role: user.role as string,
            },
        }, 'Login successful');
    },

    refresh: async (c: Context) => {
        const cookieHeader = c.req.header('Cookie') ?? '';
        const match = cookieHeader.match(/(?:^|;\s*)refresh_token=([^;]+)/);
        const rawToken = match?.[1];

        if (!rawToken) throw new UnauthorizedError('No refresh token');

        const tokenHash = hashToken(rawToken);
        const stored = await authQueries.findRefreshToken(tokenHash);
        if (!stored) throw new UnauthorizedError('Invalid or expired refresh token');

        const user = await UsersQueries.findById(stored.user_id);
        if (!user || !user.is_active) throw new UnauthorizedError('Account not found or inactive');

        // Rotate: delete old token, issue new one
        await authQueries.deleteRefreshToken(tokenHash);

        const newRawToken = randomBytes(32).toString('hex');
        const newHash = hashToken(newRawToken);
        const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL * 1000);
        await authQueries.saveRefreshToken(stored.user_id, newHash, expiresAt);

        const accessToken = await generateAccessToken(Number(user.id), user.email, user.role);

        setRefreshCookie(c, newRawToken);

        return success(c, { access_token: accessToken }, 'Token refreshed');
    },

    register: async (c: Context) => {
        const body = await c.req.json();
        const validated = registerSchema.safeParse(body);

        if (!validated.success) {
            throw new ValidationError('Invalid registration data', validated.error.errors);
        }

        const existing = await UsersQueries.findByEmail(validated.data.email);
        if (existing) throw new ConflictError('An account with this email already exists');

        const password_hash = await password.hash(validated.data.password);

        const user = await UsersQueries.create({
            email: validated.data.email,
            full_name: validated.data.full_name,
            password_hash,
            role: role.CUSTOMER,
        });

        if (!user) throw new InternalServerError('Failed to create account');

        // Auto-login after registration
        const accessToken = await generateAccessToken(Number(user.id), user.email, user.role as string);

        const rawRefreshToken = randomBytes(32).toString('hex');
        const tokenHash = hashToken(rawRefreshToken);
        const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL * 1000);
        await authQueries.saveRefreshToken(Number(user.id), tokenHash, expiresAt);

        setRefreshCookie(c, rawRefreshToken);

        return success(c, {
            access_token: accessToken,
            user: {
                id: String(user.id),
                email: user.email,
                full_name: user.full_name,
                role: user.role as string,
            },
        }, 'Account created successfully', 201);
    },

    me: async (c: Context) => {
        const { sub } = c.get('user') as { sub: string };
        const user = await UsersQueries.findById(Number(sub));
        if (!user || !user.is_active) throw new UnauthorizedError('Account not found or inactive');
        return success(c, {
            id: String(user.id),
            email: user.email,
            full_name: user.full_name,
            role: user.role as string,
            is_active: user.is_active,
            created_at: user.created_at,
            updated_at: user.updated_at,
        });
    },

    acceptInvite: async (c: Context) => {
        const body = await c.req.json();
        const validated = acceptInviteSchema.safeParse(body);
        if (!validated.success) throw new ValidationError('Invalid data', validated.error.errors);

        const tokenHash = hashToken(validated.data.token);
        const invitation = await UsersQueries.findInvitationByTokenHash(tokenHash);
        if (!invitation) throw new BadRequestError('Invalid or expired invite link');

        const user = await UsersQueries.findById(invitation.user_id);
        if (!user) throw new NotFoundError('User', invitation.user_id);

        const password_hash = await password.hash(validated.data.password);
        const activated = await UsersQueries.activateWithPassword(Number(user.id), password_hash);
        if (!activated) throw new InternalServerError('Failed to activate account');

        await UsersQueries.consumeInvitation(invitation.id);

        const accessToken = await generateAccessToken(Number(activated.id), activated.email, activated.role as string);

        const rawRefreshToken = randomBytes(32).toString('hex');
        const refreshHash = hashToken(rawRefreshToken);
        const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL * 1000);
        await authQueries.saveRefreshToken(Number(activated.id), refreshHash, expiresAt);

        setRefreshCookie(c, rawRefreshToken);

        return success(c, {
            access_token: accessToken,
            user: {
                id: String(activated.id),
                email: activated.email,
                full_name: activated.full_name,
                role: activated.role as string,
            },
        }, 'Account activated successfully');
    },

    logout: async (c: Context) => {
        const cookieHeader = c.req.header('Cookie') ?? '';
        const match = cookieHeader.match(/(?:^|;\s*)refresh_token=([^;]+)/);
        const rawToken = match?.[1];

        if (rawToken) {
            await authQueries.deleteRefreshToken(hashToken(rawToken));
        }

        clearRefreshCookie(c);
        return success(c, null, 'Logged out successfully');
    },
};
