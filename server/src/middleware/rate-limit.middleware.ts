import type { Next } from 'hono';
import { env } from '../config/env';
import type { AppContext } from '@server/lib/hono';
import { getClientIp } from '@server/lib/client-ip';

interface Entry {
    count: number;
    resetAt: number;
}

interface RateLimitResult {
    allowed: boolean;
    count: number;
    resetAt: number;
    store: 'memory' | 'redis';
}

const memoryStore = new Map<string, Entry>();

setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memoryStore.entries()) {
        if (entry.resetAt < now) memoryStore.delete(key);
    }
}, 5 * 60 * 1000).unref();

function bucketKey(c: AppContext, scope: string) {
    const user = c.get('user');
    const actor = user?.sub ? `user:${user.sub}` : `ip:${getClientIp(c)}`;
    return `rl:${scope}:${actor}:${c.req.method}:${c.req.path}`;
}

async function memoryIncrement(key: string, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    let entry = memoryStore.get(key);

    if (!entry || entry.resetAt < now) {
        entry = { count: 0, resetAt: now + windowMs };
        memoryStore.set(key, entry);
    }

    entry.count++;
    return {
        allowed: true,
        count: entry.count,
        resetAt: entry.resetAt,
        store: 'memory',
    };
}

async function redisCommand<T>(command: unknown[]): Promise<T> {
    const response = await fetch(`${env.REDIS_REST_URL}/pipeline`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${env.REDIS_REST_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify([command]),
    });

    if (!response.ok) {
        throw new Error(`Redis command failed: ${response.status}`);
    }

    const [result] = await response.json() as [{ result: T; error?: string }];
    if (result.error) throw new Error(result.error);
    return result.result;
}

async function redisIncrement(key: string, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    const ttlMs = await redisCommand<number | null>(['PTTL', key]);
    const count = await redisCommand<number>(['INCR', key]);

    let resetAt = now + windowMs;
    if (count === 1 || ttlMs == null || ttlMs < 0) {
        await redisCommand(['PEXPIRE', key, windowMs]);
    } else {
        resetAt = now + ttlMs;
    }

    return { allowed: true, count, resetAt, store: 'redis' };
}

async function increment(key: string, windowMs: number): Promise<RateLimitResult> {
    const shouldUseRedis = env.RATE_LIMIT_STORE === 'redis' && env.REDIS_REST_URL && env.REDIS_REST_TOKEN;
    if (!shouldUseRedis) return memoryIncrement(key, windowMs);

    try {
        return await redisIncrement(key, windowMs);
    } catch (error) {
        console.error('[rate-limit] Redis unavailable, falling back to memory:', error);
        return memoryIncrement(key, windowMs);
    }
}

async function peek(key: string): Promise<number> {
    const shouldUseRedis = env.RATE_LIMIT_STORE === 'redis' && env.REDIS_REST_URL && env.REDIS_REST_TOKEN;
    if (shouldUseRedis) {
        try {
            return Number(await redisCommand<string | null>(['GET', key]) ?? 0);
        } catch (error) {
            console.error('[rate-limit] Redis unavailable, falling back to memory:', error);
        }
    }
    const entry = memoryStore.get(key);
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
        blocked: async (c: AppContext) => (await peek(key(c))) >= options.limit,
        record: async (c: AppContext) => { await increment(key(c), options.windowMs); },
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
        const result = await increment(key, windowMs);
        const remaining = Math.max(0, limit - result.count);

        c.header('X-RateLimit-Limit', String(limit));
        c.header('X-RateLimit-Remaining', String(remaining));
        c.header('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));
        c.header('X-RateLimit-Store', result.store);

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
