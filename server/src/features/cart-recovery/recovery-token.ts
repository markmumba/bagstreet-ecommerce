import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function recoveryToken(secret: string, id: string, version: number, expiresAt: string) {
    return createHmac('sha256', secret).update(`cart-recovery:${id}:${version}:${expiresAt}`).digest('base64url');
}

export function unsubscribeToken(secret: string, preferenceId: string) {
    return createHmac('sha256', secret).update(`recovery-unsubscribe:${preferenceId}`).digest('base64url');
}

export function hashRecoveryToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
}

export function recoverySourceToken(secret: string, orderId: number, expiresAt: number) {
    const payload = `${orderId}.${expiresAt}`;
    const signature = createHmac('sha256', secret).update(`recovery-source:${payload}`).digest('base64url');
    return `${payload}.${signature}`;
}

export function verifyRecoverySourceToken(secret: string, token: string | undefined, now = Date.now()): number | null {
    if (!token || !/^\d+\.\d+\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const [id, expiry] = token.split('.');
    const orderId = Number(id), expiresAt = Number(expiry);
    if (!Number.isSafeInteger(orderId) || orderId <= 0 || !Number.isSafeInteger(expiresAt) || expiresAt <= now) return null;
    const expected = Buffer.from(recoverySourceToken(secret, orderId, expiresAt));
    const actual = Buffer.from(token);
    return expected.length === actual.length && timingSafeEqual(expected, actual) ? orderId : null;
}
