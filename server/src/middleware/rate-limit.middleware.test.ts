import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import type { AppEnv } from '@server/lib/hono';
import { failureLimiter, rateLimit } from './rate-limit.middleware';

describe('rateLimit', () => {
    test('allows up to the limit in a window, then 429 with Retry-After', async () => {
        const app = new Hono<AppEnv>();
        app.get('/thing', rateLimit({ scope: 'test-limit', limit: 2, windowMs: 60_000 }), (c) => c.text('ok'));

        const statuses: number[] = [];
        let last: Response | undefined;
        for (let i = 0; i < 3; i++) {
            last = await app.request('/thing');
            statuses.push(last.status);
        }
        expect(statuses).toEqual([200, 200, 429]);
        expect(last!.headers.get('X-RateLimit-Remaining')).toBe('0');
        expect(Number(last!.headers.get('Retry-After'))).toBeGreaterThan(0);
    });

    test('a new window starts once the old one has run out', async () => {
        const app = new Hono<AppEnv>();
        app.get('/short', rateLimit({ scope: 'test-window', limit: 1, windowMs: 20 }), (c) => c.text('ok'));
        expect((await app.request('/short')).status).toBe(200);
        expect((await app.request('/short')).status).toBe(429);
        await Bun.sleep(30);
        expect((await app.request('/short')).status).toBe(200);
    });
});

describe('failureLimiter', () => {
    test('only recorded failures count', async () => {
        const limiter = failureLimiter({ scope: 'test-failures', limit: 2, windowMs: 60_000 });
        const app = new Hono<AppEnv>();
        app.get('/try', async (c) => c.json({ blocked: await limiter.blocked(c) }));
        app.get('/fail', async (c) => { await limiter.record(c); return c.text('recorded'); });

        expect(await (await app.request('/try')).json()).toEqual({ blocked: false });
        await app.request('/fail');
        expect(await (await app.request('/try')).json()).toEqual({ blocked: false });
        await app.request('/fail');
        expect(await (await app.request('/try')).json()).toEqual({ blocked: true });
    });
});
