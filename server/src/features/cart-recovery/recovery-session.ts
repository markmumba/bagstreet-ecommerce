import { randomBytes } from 'node:crypto';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppContext } from '../../lib/hono';
import { env } from '../../config/env';
import { hashRecoveryToken, recoverySourceToken, verifyRecoverySourceToken } from './recovery-token';

const COOKIE_NAME = 'bagstreet_recovery';
const SOURCE_COOKIE = 'bagstreet_recovery_source';

export function recoverySessionHash(c: AppContext, create = false) {
    let token = getCookie(c, COOKIE_NAME);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) {
        if (!create) return null;
        token = randomBytes(32).toString('hex');
        setCookie(c, COOKIE_NAME, token, {
            httpOnly: true, sameSite: 'Lax', secure: env.NODE_ENV === 'production', path: '/api', maxAge: 7 * 24 * 60 * 60,
        });
    }
    return hashRecoveryToken(token);
}

export function recoverySourceOrderId(c: AppContext) {
    return verifyRecoverySourceToken(env.JWT_SECRET, getCookie(c, SOURCE_COOKIE));
}

export function rememberRecoverySource(c: AppContext, orderId: number, expiresAt: number) {
    setCookie(c, SOURCE_COOKIE, recoverySourceToken(env.JWT_SECRET, orderId, expiresAt), {
        httpOnly: true, sameSite: 'Lax', secure: env.NODE_ENV === 'production', path: '/api/orders',
        maxAge: Math.max(1, Math.floor((expiresAt - Date.now()) / 1000)),
    });
}

export function clearRecoverySource(c: AppContext) {
    deleteCookie(c, SOURCE_COOKIE, { path: '/api/orders', secure: env.NODE_ENV === 'production' });
}
