import type { AppContext } from '@server/lib/hono';
import { getRequiredUser } from '@server/lib/hono';
import { sign } from 'hono/jwt';
import { createHash, randomBytes } from 'crypto';
import { UsersQueries } from '../users/user.queries';
import { authQueries } from './auth.queries';
import { loginSchema, registerSchema, acceptInviteSchema, forgotPasswordSchema, resetPasswordSchema, updateProfileSchema, verifyInviteSchema } from './auth.schema';
import { env } from '../../config/env';
import { BadRequestError, InternalServerError, NotFoundError, UnauthorizedError, ValidationError } from '@server/lib/errors';
import { publishEmail } from '@server/services/messagequeue';
import { success } from '@server/lib/response';
import { password} from 'bun';
import { USER_ROLE } from "shared/dist";

const ACCESS_TOKEN_TTL = 15 * 60;          // 15 minutes in seconds
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days in seconds
const CUSTOMER_SETUP_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const LEGACY_REFRESH_COOKIE = 'refresh_token';
const ADMIN_REFRESH_COOKIE = 'bagstreet_admin_refresh_token';
const STOREFRONT_REFRESH_COOKIE = 'bagstreet_storefront_refresh_token';

type AppScope = 'admin' | 'storefront' | 'unknown';

function hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
}

function isStaffRole(role: string): boolean {
    return role === USER_ROLE.ADMIN || role === USER_ROLE.MANAGER;
}

function getRequestedApp(c: AppContext): AppScope {
    const header = c.req.header('X-Bagstreet-App')?.toLowerCase();
    if (header === 'admin' || header === 'storefront') return header;

    const origin = c.req.header('Origin') ?? c.req.header('Referer') ?? '';
    if (origin.startsWith(env.CLIENT_URL)) return 'admin';
    if (origin.startsWith(env.STOREFRONT_URL)) return 'storefront';

    return 'unknown';
}

function roleAllowedForApp(role: string, app: AppScope): boolean {
    if (app === 'admin') return isStaffRole(role);
    if (app === 'storefront') return role === USER_ROLE.CUSTOMER;
    return true;
}

function refreshCookieNameForRole(role: string): string {
    return isStaffRole(role) ? ADMIN_REFRESH_COOKIE : STOREFRONT_REFRESH_COOKIE;
}

function refreshCookieNamesForApp(app: AppScope): string[] {
    if (app === 'admin') return [ADMIN_REFRESH_COOKIE, LEGACY_REFRESH_COOKIE];
    if (app === 'storefront') return [STOREFRONT_REFRESH_COOKIE, LEGACY_REFRESH_COOKIE];
    return [ADMIN_REFRESH_COOKIE, STOREFRONT_REFRESH_COOKIE, LEGACY_REFRESH_COOKIE];
}

function parseCookies(header: string): Record<string, string> {
    return header.split(';').reduce<Record<string, string>>((cookies, part) => {
        const [rawName, ...rawValue] = part.trim().split('=');
        if (!rawName || rawValue.length === 0) return cookies;
        cookies[rawName] = decodeURIComponent(rawValue.join('='));
        return cookies;
    }, {});
}

async function generateAccessToken(userId: number, email: string, role: string): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return sign(
        { sub: String(userId), email, role, iat: now, exp: now + ACCESS_TOKEN_TTL },
        env.JWT_SECRET,
        'HS256'
    );
}

function setRefreshCookie(c: AppContext, token: string, role: string) {
    const isProduction = env.NODE_ENV === 'production';
    const cookieName = refreshCookieNameForRole(role);
    c.header(
        'Set-Cookie',
        `${cookieName}=${encodeURIComponent(token)}; HttpOnly; Path=/api/auth; SameSite=Lax; Max-Age=${REFRESH_TOKEN_TTL}${isProduction ? '; Secure' : ''}`,
        { append: true }
    );
    clearCookie(c, LEGACY_REFRESH_COOKIE);
}

function clearCookie(c: AppContext, name: string) {
    c.header(
        'Set-Cookie',
        `${name}=; HttpOnly; Path=/api/auth; SameSite=Lax; Max-Age=0`,
        { append: true }
    );
}

function clearRefreshCookies(c: AppContext, app: AppScope = 'unknown') {
    for (const name of refreshCookieNamesForApp(app)) clearCookie(c, name);
}

function displayNameFromEmail(email: string): string {
    const localPart = email.split('@')[0] || 'Customer';
    return localPart
        .replace(/[._-]+/g, ' ')
        .trim()
        .replace(/\b\w/g, (char) => char.toUpperCase()) || 'Customer';
}

export const authHandlers = {

    login: async (c: AppContext) => {
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

        const requestedApp = getRequestedApp(c);
        if (!roleAllowedForApp(user.role as string, requestedApp)) {
            throw new UnauthorizedError('Invalid email or password');
        }

        const accessToken = await generateAccessToken(Number(user.id), user.email, user.role);

        const rawRefreshToken = randomBytes(32).toString('hex');
        const tokenHash = hashToken(rawRefreshToken);
        const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL * 1000);
        await authQueries.saveRefreshToken(Number(user.id), tokenHash, expiresAt);

        setRefreshCookie(c, rawRefreshToken, user.role as string);

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

    refresh: async (c: AppContext) => {
        const requestedApp = getRequestedApp(c);
        const cookies = parseCookies(c.req.header('Cookie') ?? '');
        let tokenHash: string | null = null;
        let stored: Awaited<ReturnType<typeof authQueries.findRefreshToken>> | undefined;
        let user: Awaited<ReturnType<typeof UsersQueries.findById>> | undefined;

        for (const cookieName of refreshCookieNamesForApp(requestedApp)) {
            const rawToken = cookies[cookieName];
            if (!rawToken) continue;

            const candidateHash = hashToken(rawToken);
            const candidateToken = await authQueries.findRefreshToken(candidateHash);
            if (!candidateToken) continue;

            const candidateUser = await UsersQueries.findById(candidateToken.user_id);
            if (!candidateUser || !candidateUser.is_active) continue;
            if (!roleAllowedForApp(candidateUser.role as string, requestedApp)) continue;

            tokenHash = candidateHash;
            stored = candidateToken;
            user = candidateUser;
            break;
        }

        if (!tokenHash || !stored || !user) throw new UnauthorizedError('No valid refresh token');

        await authQueries.deleteRefreshToken(tokenHash);

        const newRawToken = randomBytes(32).toString('hex');
        const newHash = hashToken(newRawToken);
        const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL * 1000);
        await authQueries.saveRefreshToken(stored.user_id, newHash, expiresAt);

        const accessToken = await generateAccessToken(Number(user.id), user.email, user.role);

        setRefreshCookie(c, newRawToken, user.role as string);

        return success(c, { access_token: accessToken }, 'Token refreshed');
    },

    register: async (c: AppContext) => {
        const body = await c.req.json();
        const validated = registerSchema.safeParse(body);

        if (!validated.success) {
            throw new ValidationError('Invalid registration data', validated.error.errors);
        }

        const email = validated.data.email.trim().toLowerCase();
        const existing = await UsersQueries.findByEmail(email);
        const genericMessage = 'If this email can be registered, we will send an account setup link shortly';

        if (existing && ((existing.role as string) !== USER_ROLE.CUSTOMER || existing.is_active)) {
            return success(c, null, genericMessage, 202);
        }

        let user = existing;
        if (!user) {
            const placeholderHash = await password.hash(randomBytes(32).toString('hex'));
            user = await UsersQueries.create({
                email,
                full_name: displayNameFromEmail(email),
                password_hash: placeholderHash,
                role: USER_ROLE.CUSTOMER,
            });
        }

        if (!user) throw new InternalServerError('Failed to create account setup');

        const rawToken = randomBytes(32).toString('hex');
        const tokenHash = hashToken(rawToken);
        const expiresAt = new Date(Date.now() + CUSTOMER_SETUP_TTL_MS);
        await UsersQueries.createInvitation(Number(user.id), tokenHash, expiresAt);

        const setupUrl = `${env.STOREFRONT_URL}/setup-account?token=${rawToken}`;
        await publishEmail({
            type: 'CUSTOMER_ACCOUNT_SETUP',
            to: user.email,
            name: user.full_name,
            setupUrl,
        });

        return success(c, null, genericMessage, 202);
    },

    me: async (c: AppContext) => {
        const { sub } = getRequiredUser(c);
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

    acceptInvite: async (c: AppContext) => {
        const body = await c.req.json();
        const validated = acceptInviteSchema.safeParse(body);
        if (!validated.success) throw new ValidationError('Invalid data', validated.error.errors);

        const tokenHash = hashToken(validated.data.token);
        const invitation = await UsersQueries.findInvitationByTokenHash(tokenHash);
        if (!invitation) throw new BadRequestError('Invalid or expired invite link');

        const user = await UsersQueries.findById(invitation.user_id);
        if (!user) throw new NotFoundError('User', invitation.user_id);

        const requestedApp = getRequestedApp(c);
        if (!roleAllowedForApp(user.role as string, requestedApp)) {
            throw new BadRequestError('Invalid invite link for this application');
        }

        const password_hash = await password.hash(validated.data.password);
        const activated = await UsersQueries.activateWithPassword(Number(user.id), password_hash);
        if (!activated) throw new InternalServerError('Failed to activate account');

        await UsersQueries.consumeInvitation(invitation.id);

        const accessToken = await generateAccessToken(Number(activated.id), activated.email, activated.role as string);

        const rawRefreshToken = randomBytes(32).toString('hex');
        const refreshHash = hashToken(rawRefreshToken);
        const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL * 1000);
        await authQueries.saveRefreshToken(Number(activated.id), refreshHash, expiresAt);

        setRefreshCookie(c, rawRefreshToken, activated.role as string);

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

    verifyInvite: async (c: AppContext) => {
        const body = await c.req.json();
        const validated = verifyInviteSchema.safeParse(body);
        if (!validated.success) throw new ValidationError('Invalid invite data', validated.error.errors);

        const tokenHash = hashToken(validated.data.token);
        const invitation = await UsersQueries.findInvitationByTokenHash(tokenHash);
        if (!invitation) throw new BadRequestError('Invalid or expired invite link');

        const user = await UsersQueries.findById(invitation.user_id);
        if (!user) throw new NotFoundError('User', invitation.user_id);

        return success(c, {
            email: user.email,
            full_name: user.full_name,
            role: user.role as string,
            expires_at: invitation.expires_at,
        }, 'Invite link is valid');
    },

    updateProfile: async (c: AppContext) => {
        const { sub } = getRequiredUser(c);
        const body = await c.req.json();
        const validated = updateProfileSchema.safeParse(body);
        if (!validated.success) throw new ValidationError('Invalid data', validated.error.errors);

        // findByEmail returns password_hash; findById does not
        const fullUser = await UsersQueries.findById(Number(sub));
        if (!fullUser || !fullUser.is_active) throw new UnauthorizedError('Account not found or inactive');

        let newHash: string | undefined;
        if (validated.data.new_password) {
            // Need password_hash — fetch with findByEmail
            const rawUser = await UsersQueries.findByEmail(fullUser.email);
            if (!rawUser) throw new UnauthorizedError('Account not found');
            const valid = await password.verify(validated.data.current_password!, (rawUser as any).password_hash);
            if (!valid) throw new BadRequestError('Current password is incorrect');
            newHash = await password.hash(validated.data.new_password);
        }

        let updated = fullUser;
        if (validated.data.full_name) {
            updated = (await UsersQueries.update(Number(sub), { full_name: validated.data.full_name })) ?? updated;
        }
        if (newHash) {
            updated = (await UsersQueries.activateWithPassword(Number(sub), newHash)) ?? updated;
        }

        return success(c, {
            id: String(updated.id),
            email: updated.email,
            full_name: updated.full_name,
            role: updated.role as string,
            is_active: updated.is_active,
            created_at: updated.created_at,
            updated_at: updated.updated_at,
        }, 'Profile updated successfully');
    },

    forgotPassword: async (c: AppContext) => {
        const body = await c.req.json();
        const validated = forgotPasswordSchema.safeParse(body);
        if (!validated.success) throw new ValidationError('Invalid data', validated.error.errors);

        const user = await UsersQueries.findByEmail(validated.data.email);
        // Always return 200 — don't reveal whether email exists
        if (!user || !user.is_active) {
            return success(c, null, 'If that email is registered you will receive a reset link shortly');
        }

        const rawToken = randomBytes(32).toString('hex');
        const tokenHash = hashToken(rawToken);
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await authQueries.createPasswordResetToken(Number(user.id), tokenHash, expiresAt);

        const isCustomer = (user.role as string) === USER_ROLE.CUSTOMER;
        const baseUrl = isCustomer ? env.STOREFRONT_URL : env.CLIENT_URL;
        const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;
        await publishEmail({ type: 'PASSWORD_RESET', to: validated.data.email, name: user.full_name, resetUrl });

        return success(c, null, 'If that email is registered you will receive a reset link shortly');
    },

    resetPassword: async (c: AppContext) => {
        const body = await c.req.json();
        const validated = resetPasswordSchema.safeParse(body);
        if (!validated.success) throw new ValidationError('Invalid data', validated.error.errors);

        const tokenHash = hashToken(validated.data.token);
        const resetToken = await authQueries.findPasswordResetToken(tokenHash);
        if (!resetToken) throw new BadRequestError('Invalid or expired reset link');

        const user = await UsersQueries.findById(resetToken.user_id);
        if (!user) throw new NotFoundError('User', resetToken.user_id);

        const password_hash = await password.hash(validated.data.password);
        const updated = await UsersQueries.activateWithPassword(Number(user.id), password_hash);
        if (!updated) throw new InternalServerError('Failed to reset password');

        await authQueries.consumePasswordResetToken(resetToken.id);
        // Invalidate all existing sessions after password reset
        await authQueries.deleteAllUserRefreshTokens(Number(user.id));

        return success(c, null, 'Password reset successfully');
    },

    logout: async (c: AppContext) => {
        const requestedApp = getRequestedApp(c);
        const cookies = parseCookies(c.req.header('Cookie') ?? '');
        for (const cookieName of refreshCookieNamesForApp(requestedApp)) {
            const rawToken = cookies[cookieName];
            if (!rawToken) continue;
            await authQueries.deleteRefreshToken(hashToken(rawToken));
        }

        clearRefreshCookies(c, requestedApp);
        return success(c, null, 'Logged out successfully');
    },
};
