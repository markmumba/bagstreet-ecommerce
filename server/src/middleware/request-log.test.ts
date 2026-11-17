import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { Hono } from 'hono';
import type { AppEnv } from '@server/lib/hono';
import { NotFoundError } from '../lib/errors';
import { buildEntry, log, serializeError, withRequestScope } from '../lib/log';
import { errorHandler } from './error-handler';
import { requestLog } from './request-log';

/** Captures what the logger writes, parsed as JSON lines. */
function captureLogs() {
    const lines: Record<string, any>[] = [];
    const grab = (chunk: unknown) => {
        for (const line of String(chunk).split('\n').filter(Boolean)) lines.push(JSON.parse(line));
        return true;
    };
    const out = spyOn(process.stdout, 'write').mockImplementation(grab as any);
    const err = spyOn(process.stderr, 'write').mockImplementation(grab as any);
    return { lines, restore: () => { out.mockRestore(); err.mockRestore(); } };
}

function makeApp() {
    const app = new Hono<AppEnv>();
    app.use('*', requestLog);
    app.get('/ok', (c) => { log.info('inside handler', { order_id: 7 }); return c.text('ok'); });
    app.get('/missing', () => { throw new NotFoundError('Order', 9); });
    app.get('/boom', () => { throw new Error('database exploded'); });
    app.get('/health/ready', (c) => c.text('ready'));
    app.onError(errorHandler);
    return app;
}

let capture: ReturnType<typeof captureLogs>;
const savedFormat = process.env.LOG_FORMAT;

beforeEach(() => {
    process.env.LOG_FORMAT = 'json';
    capture = captureLogs();
});
afterEach(() => {
    capture.restore();
    if (savedFormat === undefined) delete process.env.LOG_FORMAT;
    else process.env.LOG_FORMAT = savedFormat;
});

describe('requestLog', () => {
    test('one summary line per request, and handler logs share its request id', async () => {
        const res = await makeApp().request('/ok?token=secret');
        const id = res.headers.get('X-Request-Id');
        expect(id).toBeTruthy();

        const [inner, summary] = capture.lines;
        expect(inner).toMatchObject({ level: 'info', msg: 'inside handler', order_id: 7, request_id: id });
        expect(summary).toMatchObject({ level: 'info', msg: 'request', method: 'GET', path: '/ok', status: 200, request_id: id });
        expect(typeof summary.duration_ms).toBe('number');
        expect(JSON.stringify(capture.lines)).not.toContain('secret');
    });

    test('keeps a well-formed incoming id, replaces anything else', async () => {
        const app = makeApp();
        const kept = await app.request('/ok', { headers: { 'X-Request-Id': 'abc12345-proxy' } });
        expect(kept.headers.get('X-Request-Id')).toBe('abc12345-proxy');
        const replaced = await app.request('/ok', { headers: { 'X-Request-Id': '<script>' } });
        expect(replaced.headers.get('X-Request-Id')).not.toBe('<script>');
    });

    test('expected errors: request line carries the code, no stack logged', async () => {
        const res = await makeApp().request('/missing');
        expect(res.status).toBe(404);
        expect(capture.lines).toHaveLength(1);
        expect(capture.lines[0]).toMatchObject({ msg: 'request', status: 404, error_code: 'NOT_FOUND' });
    });

    test('unexpected errors: stack logged, response carries the reference', async () => {
        const res = await makeApp().request('/boom');
        const id = res.headers.get('X-Request-Id')!;
        expect(res.status).toBe(500);

        const failure = capture.lines.find((l) => l.msg === 'request failed')!;
        expect(failure).toMatchObject({ level: 'error', request_id: id, path: '/boom' });
        expect(failure.err.message).toBe('database exploded');
        expect(failure.err.stack).toContain('database exploded');
        expect(capture.lines.at(-1)).toMatchObject({ level: 'error', msg: 'request', status: 500, error_code: 'INTERNAL_ERROR' });
    });

    test('successful health checks are not logged', async () => {
        await makeApp().request('/health/ready');
        expect(capture.lines).toHaveLength(0);
    });
});

describe('log entries', () => {
    test('outside a request there is no request id; undefined fields are dropped', () => {
        const entry = buildEntry('info', 'tick', { a: 1, b: undefined }, new Date('2026-01-01T00:00:00Z'));
        expect(entry).toEqual({ time: '2026-01-01T00:00:00.000Z', level: 'info', msg: 'tick', a: 1 });
    });

    test('inside a request scope the id is attached', () => {
        const entry = withRequestScope('req-12345678', () => buildEntry('warn', 'x'));
        expect(entry.request_id).toBe('req-12345678');
    });

    test('errors keep code, stack and cause', () => {
        const err = Object.assign(new Error('outer', { cause: new Error('inner') }), { code: 'E1' });
        const out = serializeError(err) as any;
        expect(out).toMatchObject({ name: 'Error', message: 'outer', code: 'E1' });
        expect(out.stack).toContain('outer');
        expect(out.cause.message).toBe('inner');
        expect(serializeError('plain string')).toEqual({ message: 'plain string' });
    });

    test('LOG_LEVEL hides lower levels', () => {
        process.env.LOG_LEVEL = 'warn';
        try {
            log.info('hidden');
            log.warn('shown');
        } finally {
            delete process.env.LOG_LEVEL;
        }
        expect(capture.lines.map((l) => l.msg)).toEqual(['shown']);
    });
});
