import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';

const PURPOSE = 'order-received';
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function sign(orderRef: string | number, expiresAt: number) {
    return createHmac('sha256', env.JWT_SECRET)
        .update(`${PURPOSE}:${orderRef}:${expiresAt}`)
        .digest('hex');
}

export function createOrderReceivedToken(orderRef: string | number) {
    const expiresAt = Date.now() + TOKEN_TTL_MS;
    return `${expiresAt}.${sign(orderRef, expiresAt)}`;
}

export function verifyOrderReceivedToken(orderRef: string | number, token: string | undefined) {
    if (!token) return false;

    const [expiresAtRaw, signature] = token.split('.');
    const expiresAt = Number(expiresAtRaw);
    if (!Number.isFinite(expiresAt) || !signature || expiresAt < Date.now()) return false;

    const expected = sign(orderRef, expiresAt);
    const actualBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (actualBuffer.length !== expectedBuffer.length) return false;

    return timingSafeEqual(actualBuffer, expectedBuffer);
}
