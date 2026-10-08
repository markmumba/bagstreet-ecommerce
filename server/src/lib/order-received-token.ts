import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';

/**
 * Signed, expiring tokens tied to one order. They let a guest (no account) prove they own an order:
 * - `order-received`: link in the confirmation email to mark the order as received
 * - `order-access`: issued at checkout so the guest can check or retry payment for that order
 * The purpose is part of the signature, so one kind can't be used as the other.
 */
type TokenPurpose = 'order-received' | 'order-access';

const TTL_MS: Record<TokenPurpose, number> = {
    'order-received': 1000 * 60 * 60 * 24 * 30,
    'order-access': 1000 * 60 * 60 * 24 * 7,
};

function sign(purpose: TokenPurpose, orderRef: string | number, expiresAt: number) {
    return createHmac('sha256', env.JWT_SECRET)
        .update(`${purpose}:${orderRef}:${expiresAt}`)
        .digest('hex');
}

function createToken(purpose: TokenPurpose, orderRef: string | number) {
    const expiresAt = Date.now() + TTL_MS[purpose];
    return `${expiresAt}.${sign(purpose, orderRef, expiresAt)}`;
}

function verifyToken(purpose: TokenPurpose, orderRef: string | number, token: string | undefined) {
    if (!token) return false;

    const [expiresAtRaw, signature] = token.split('.');
    const expiresAt = Number(expiresAtRaw);
    if (!Number.isFinite(expiresAt) || !signature || expiresAt < Date.now()) return false;

    const expected = sign(purpose, orderRef, expiresAt);
    const actualBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (actualBuffer.length !== expectedBuffer.length) return false;

    return timingSafeEqual(actualBuffer, expectedBuffer);
}

export const createOrderReceivedToken = (orderRef: string | number) => createToken('order-received', orderRef);
export const verifyOrderReceivedToken = (orderRef: string | number, token: string | undefined) =>
    verifyToken('order-received', orderRef, token);

export const createOrderAccessToken = (orderRef: string | number) => createToken('order-access', orderRef);
export const verifyOrderAccessToken = (orderRef: string | number, token: string | undefined) =>
    verifyToken('order-access', orderRef, token);

/** The reference tokens are bound to: the public id when present, otherwise the numeric id. */
export function orderTokenRef(order: { id: number | string; public_id?: string | null }) {
    return String(order.public_id ?? order.id);
}
