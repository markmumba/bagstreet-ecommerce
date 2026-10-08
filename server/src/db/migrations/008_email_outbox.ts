import type { Migration } from './types';

/**
 * Transactional outbox for emails (replaces RabbitMQ). An email is a row written in the same
 * transaction as the change that causes it, then sent by a worker in the API with retries.
 */
export const emailOutboxMigration: Migration = {
    id: '008',
    name: 'email_outbox',
    async up(sql) {
        await sql`
            CREATE TABLE IF NOT EXISTS email_outbox (
                id BIGSERIAL PRIMARY KEY,
                job_type VARCHAR(50) NOT NULL,
                recipient TEXT NOT NULL,
                payload JSONB NOT NULL,
                -- Same event can't be queued twice (e.g. "order-confirmation:123").
                dedupe_key TEXT,
                status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'FAILED')),
                attempts INTEGER NOT NULL DEFAULT 0,
                next_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                -- While SENDING: when the claim expires (a crashed worker's rows become claimable again).
                locked_until TIMESTAMP,
                last_error TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                sent_at TIMESTAMP
            )
        `;
        await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_email_outbox_dedupe ON email_outbox(dedupe_key) WHERE dedupe_key IS NOT NULL`;
        await sql`CREATE INDEX IF NOT EXISTS idx_email_outbox_due ON email_outbox(next_attempt_at) WHERE status = 'PENDING'`;
        await sql`CREATE INDEX IF NOT EXISTS idx_email_outbox_sending ON email_outbox(locked_until) WHERE status = 'SENDING'`;
        await sql`CREATE INDEX IF NOT EXISTS idx_email_outbox_status_created ON email_outbox(status, created_at)`;
    },
};
