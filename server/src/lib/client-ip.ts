import { getConnInfo } from 'hono/bun';
import type { Context } from 'hono';
import { env } from '../config/env';

/**
 * The client's IP address, for rate limiting and audit logs.
 *
 * `X-Forwarded-For` is written by whoever sends the request, so trusting its first entry lets anyone
 * dodge IP limits by sending a fake header. Instead:
 * - `TRUST_PROXY_HOPS=0` (default): no proxy in front — use the socket address, ignore the header.
 * - `TRUST_PROXY_HOPS=N`: N proxies you control are in front — each appends the address it saw,
 *   so the client is the Nth entry from the right; anything left of that is client-supplied.
 */
export function getClientIp(c: Context): string {
    const hops = env.TRUST_PROXY_HOPS;

    if (hops > 0) {
        const chain = (c.req.header('x-forwarded-for') ?? '')
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean);
        const fromProxy = chain[chain.length - hops];
        if (fromProxy) return fromProxy;
    }

    try {
        return getConnInfo(c).remote.address ?? 'unknown';
    } catch {
        // Not running under Bun's server (e.g. app.request() in scripts/tests).
        return 'unknown';
    }
}
