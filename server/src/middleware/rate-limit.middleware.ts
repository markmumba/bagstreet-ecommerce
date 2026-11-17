import type { Next } from 'hono';
import type { AppContext } from '@server/lib/hono';
import { getClientIp } from '@server/lib/client-ip';

/**
 * Request counters, kept in this process's memory. Fine for one API instance; counters reset when
 * the API restarts. Per-customer order limits don't depend on this (they're in Postgres).
 */
interface Entry {
    count: number;
    resetAt: number;
}

const counters = new Map<string, Entry>();

setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of counters.entries()) {
        if (entry.resetAt < now) counters.delete(key);
    }
}, 5 * 60 * 1000).unref();

function bucketKey(c: AppContext, scope: string) {
    const user = c.get('user');
    const actor = user?.sub ? `user:${user.sub}` : `ip:${getClientIp(c)}`;
    return `rl:${scope}:${actor}:${c.req.method}:${c.req.path}`;
}

/** Counts one more hit for `key` in its current window (starting a new window if it ran out). */
function increment(key: string, windowMs: number): Entry {
    const now = Date.now();
    let entry = counters.get(key);
    if (!entry || entry.resetAt < now) {
        entry = { count: 0, resetAt: now + windowMs };
        counters.set(key, entry);
    }
    entry.count++;
    return entry;
}

/** Hits so far in the current window, without counting one. */
function peek(key: string): number {
    const entry = counters.get(key);
    return entry && entry.resetAt >= Date.now() ? entry.count : 0;
}

/**
 * Counts failures only, per signed-in user or IP (not per route), e.g. wrong gift voucher codes:
 * customers retyping their own code are never slowed down, but guessing codes is.
 */
export function failureLimiter(options: { scope: string; limit: number; windowMs: number }) {
    const key = (c: AppContext) => {
        const user = c.get('user');
        return `rl:${options.scope}:${user?.sub ? `user:${user.sub}` : `ip:${getClientIp(c)}`}`;
    };
    return {
        /** True once the limit of failures has been reached in the window. */
        blocked: async (c: AppContext) => peek(key(c)) >= options.limit,
        record: async (c: AppContext) => { increment(key(c), options.windowMs); },
    };
}

/** Wrong gift voucher codes: 10 an hour is plenty for typos, useless for guessing 2^80 codes. */
export const voucherCodeFailures = failureLimiter({ scope: 'voucher-code', limit: 10, windowMs: 60 * 60 * 1000 });

export function rateLimit(options: {
    limit: number;
    windowMs: number;
    scope?: string;
    message?: string;
}) {
    const {
        limit,
        windowMs,
        scope = 'general',
        message = 'Too many requests, please try again later',
    } = options;

    return async (c: AppContext, next: Next) => {
        const key = bucketKey(c, scope);
        const result = increment(key, windowMs);
        const remaining = Math.max(0, limit - result.count);

        c.header('X-RateLimit-Limit', String(limit));
        c.header('X-RateLimit-Remaining', String(remaining));
        c.header('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));

        if (result.count > limit) {
            const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
            c.header('Retry-After', String(retryAfter));
            return c.json({ success: false, message }, 429);
        }

        await next();
    };
}

export const authRateLimit = rateLimit({
    scope: 'auth',
    limit: 10,
    windowMs: 15 * 60 * 1000,
});

export const generalRateLimit = rateLimit({
    scope: 'general',
    limit: 120,
    windowMs: 60 * 1000,
});

export const orderRateLimit = rateLimit({
    scope: 'orders',
    limit: 20,
    windowMs: 60 * 1000,
});

/**
 * Placing orders, per IP per hour. Deliberately loose: Kenyan mobile networks put many customers
 * behind one IP, so the real per-customer limits live in order creation (see order-limits.ts).
 */
export const orderPlacementRateLimit = rateLimit({
    scope: 'order-placement',
    limit: 10,
    windowMs: 60 * 60 * 1000,
    message: 'Too many orders from this network in the last hour. Please try again later.',
});

export const paymentRateLimit = rateLimit({
    scope: 'payments',
    limit: 30,
    windowMs: 60 * 1000,
});
