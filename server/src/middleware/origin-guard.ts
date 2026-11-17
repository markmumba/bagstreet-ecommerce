import type { MiddlewareHandler } from 'hono';
import { env } from '../config/env';
import { ForbiddenError } from '../lib/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * The origin a browser says a request came from: `Origin`, or the origin part of
 * `Referer` when a browser left `Origin` out. Returns null when neither is usable.
 */
export function requestOrigin(origin: string | undefined, referer: string | undefined): string | null {
    if (origin) return origin === 'null' ? null : origin;
    if (!referer) return null;
    try {
        return new URL(referer).origin;
    } catch {
        return null;
    }
}

/**
 * CSRF check for routes that read or set cookies. Unsafe methods must name an
 * allowed application origin. Browsers always send `Origin` on POST/PUT/PATCH/DELETE,
 * so a request with neither `Origin` nor `Referer` is refused; scripts must send one.
 */
export function isTrustedRequest(
    method: string,
    headers: { origin?: string; referer?: string },
    allowed: readonly string[],
): boolean {
    if (SAFE_METHODS.has(method.toUpperCase())) return true;
    const origin = requestOrigin(headers.origin, headers.referer);
    return origin !== null && allowed.includes(origin);
}

export const requireTrustedOrigin: MiddlewareHandler = async (c, next) => {
    const trusted = isTrustedRequest(
        c.req.method,
        { origin: c.req.header('Origin'), referer: c.req.header('Referer') },
        env.CORS_ORIGIN,
    );
    if (!trusted) throw new ForbiddenError('Request origin not allowed');
    await next();
};
