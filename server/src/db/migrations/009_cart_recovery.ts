import type { Migration } from './types';

export const cartRecoveryMigration: Migration = {
    id: '009',
    name: 'cart_recovery',
    async up(sql) {
        await sql`
            CREATE TABLE email_preferences (
                id UUID PRIMARY KEY,
                email VARCHAR(254) NOT NULL UNIQUE,
                recovery_opt_in BOOLEAN NOT NULL DEFAULT false,
                consent_at TIMESTAMPTZ,
                consent_source VARCHAR(30),
                unsubscribed_at TIMESTAMPTZ,
                reminder_window_start TIMESTAMPTZ,
                reminder_count INTEGER NOT NULL DEFAULT 0,
                last_reminder_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        `;
        await sql`
            CREATE TABLE cart_recovery_snapshots (
                id UUID PRIMARY KEY,
                session_hash TEXT NOT NULL UNIQUE,
                email VARCHAR(254) NOT NULL REFERENCES email_preferences(email) ON DELETE CASCADE,
                items JSONB NOT NULL,
                order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
                state VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE', 'ORDERED', 'STOPPED')),
                version INTEGER NOT NULL DEFAULT 1,
                token_hash TEXT NOT NULL UNIQUE,
                last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                expires_at TIMESTAMPTZ NOT NULL,
                reminder_stage INTEGER NOT NULL DEFAULT 0 CHECK (reminder_stage BETWEEN 0 AND 2),
                queued_stage INTEGER NOT NULL DEFAULT 0 CHECK (queued_stage BETWEEN 0 AND 2),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        `;
        await sql`CREATE INDEX idx_cart_recovery_due ON cart_recovery_snapshots(last_activity_at) WHERE state <> 'STOPPED'`;
        await sql`CREATE INDEX idx_cart_recovery_email ON cart_recovery_snapshots(email)`;
        await sql`ALTER TABLE email_outbox DROP CONSTRAINT email_outbox_status_check`;
        await sql`ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_status_check CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED'))`;
    },
};
