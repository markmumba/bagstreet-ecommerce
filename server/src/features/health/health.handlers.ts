import type { AppContext } from '@server/lib/hono';
import { env } from '../../config/env';
import { sql } from '../../lib/db';
import { isPesapalConfigured, pesapalBulkhead, pesapalCircuit } from '../../services/pesapal';

async function checkDatabase() {
    const started = Date.now();
    await sql`SELECT 1`;
    return { status: 'UP', latency_ms: Date.now() - started };
}

export const healthHandlers = {
    live: (c: AppContext) => c.json({
        status: 'UP',
        timestamp: new Date().toISOString(),
        environment: env.NODE_ENV,
        version: process.env.npm_package_version || '1.0.0',
    }),

    ready: async (c: AppContext) => {
        const checks: Record<string, unknown> = {};
        let ready = true;

        try {
            checks.database = await checkDatabase();
        } catch (error) {
            ready = false;
            checks.database = {
                status: 'DOWN',
                error: (error as Error).message,
            };
        }

        checks.rate_limit = {
            store: env.RATE_LIMIT_STORE,
            redis_configured: Boolean(env.REDIS_REST_URL && env.REDIS_REST_TOKEN),
        };
        checks.circuits = {
            pesapal: pesapalCircuit.snapshot(),
        };
        checks.bulkheads = {
            pesapal: pesapalBulkhead.snapshot(),
        };
        checks.integrations = {
            rabbitmq_configured: Boolean(env.RABBITMQ_URL),
            payment_provider: 'pesapal',
            pesapal_configured: isPesapalConfigured(),
        };

        return c.json({
            status: ready ? 'READY' : 'NOT_READY',
            timestamp: new Date().toISOString(),
            checks,
        }, ready ? 200 : 503);
    },
};
