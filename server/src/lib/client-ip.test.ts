import { afterEach, describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { env } from '../config/env';
import { getClientIp } from './client-ip';

const app = new Hono();
app.get('/', (c) => c.text(getClientIp(c)));
const ipFor = async (xff?: string) =>
    (await app.request('/', { headers: xff ? { 'x-forwarded-for': xff } : {} })).text();

const original = env.TRUST_PROXY_HOPS;
afterEach(() => { (env as { TRUST_PROXY_HOPS: number }).TRUST_PROXY_HOPS = original; });
const setHops = (n: number) => { (env as { TRUST_PROXY_HOPS: number }).TRUST_PROXY_HOPS = n; };

describe('getClientIp', () => {
    test('no proxy: a client-sent X-Forwarded-For is ignored', async () => {
        setHops(0);
        // app.request() has no socket, so the fallback is "unknown" — crucially not the spoofed value.
        expect(await ipFor('6.6.6.6')).toBe('unknown');
    });
    test('one proxy: uses the address the proxy appended, not the client-supplied one', async () => {
        setHops(1);
        expect(await ipFor('6.6.6.6, 41.90.1.2')).toBe('41.90.1.2');
    });
    test('two proxies: counts from the right', async () => {
        setHops(2);
        expect(await ipFor('6.6.6.6, 41.90.1.2, 10.0.0.5')).toBe('41.90.1.2');
    });
    test('chain shorter than configured hops falls back instead of trusting the header', async () => {
        setHops(3);
        expect(await ipFor('41.90.1.2')).toBe('unknown');
    });
});
