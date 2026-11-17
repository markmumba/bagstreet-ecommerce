/**
 * Gives every request an id (X-Request-Id response header) and writes one summary line when it
 * ends: method, path, status, duration. The query string is left out — it can carry tokens.
 *
 * An incoming X-Request-Id is kept when it looks like an id, so a proxy's id can be followed
 * through; anything else is replaced.
 */
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '@server/lib/hono';
import { annotateRequest, log, requestAnnotations, withRequestScope } from '../lib/log';

const INCOMING_ID = /^[A-Za-z0-9._-]{8,64}$/;

/** Successful health checks are left out: an uptime monitor calls them every minute. */
const QUIET_PATHS = new Set(['/health', '/health/live', '/health/ready']);

export const requestLog = createMiddleware<AppEnv>(async (c, next) => {
    const incoming = c.req.header('x-request-id');
    const requestId = incoming && INCOMING_ID.test(incoming) ? incoming : crypto.randomUUID();
    const started = performance.now();

    await withRequestScope(requestId, async () => {
        c.header('X-Request-Id', requestId);
        try {
            await next();
        } finally {
            const status = c.res.status;
            if (QUIET_PATHS.has(c.req.path) && status < 400) return;

            const user = c.get('user');
            if (user) annotateRequest({ user_id: user.sub });
            const fields = {
                method: c.req.method,
                path: c.req.path,
                status,
                duration_ms: Math.round(performance.now() - started),
                ...requestAnnotations(),
            };
            if (status >= 500) log.error('request', fields);
            // Other 4xx (expired sessions, bad input) are routine; a burst of 429s is worth seeing.
            else if (status === 429) log.warn('request', fields);
            else log.info('request', fields);
        }
    });
});
