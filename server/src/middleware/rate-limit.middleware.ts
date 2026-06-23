import type { Context, Next } from 'hono';

interface Entry {
    count: number;
    resetAt: number;
}

const store = new Map<string, Entry>();

// Purge expired entries every 5 minutes to prevent memory growth
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
        if (entry.resetAt < now) store.delete(key);
    }
}, 5 * 60 * 1000);

function getIp(c: Context): string {
    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded) {
        const firstIp = forwarded.split(',')[0];
        if (firstIp) return firstIp.trim();
    }

    return c.req.header('x-real-ip') ?? 'unknown';
}

export function rateLimit(options: { limit: number; windowMs: number; message?: string }) {
    const { limit, windowMs, message = 'Too many requests, please try again later' } = options;

    return async (c: Context, next: Next) => {
        const key = `${getIp(c)}:${c.req.path}`;
        const now = Date.now();
        let entry = store.get(key);

        if (!entry || entry.resetAt < now) {
            entry = { count: 1, resetAt: now + windowMs };
            store.set(key, entry);
        } else if (entry.count >= limit) {
            const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
            c.header('Retry-After', String(retryAfter));
            c.header('X-RateLimit-Limit', String(limit));
            c.header('X-RateLimit-Remaining', '0');
            c.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));
            return c.json({ success: false, message }, 429);
        } else {
            entry.count++;
        }

        c.header('X-RateLimit-Limit', String(limit));
        c.header('X-RateLimit-Remaining', String(Math.max(0, limit - entry.count)));
        c.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

        await next();
    };
}

// Presets
export const authRateLimit = rateLimit({ limit: 10, windowMs: 15 * 60 * 1000 });   // 10 per 15 min
export const generalRateLimit = rateLimit({ limit: 100, windowMs: 60 * 1000 });     // 100 per 1 min
