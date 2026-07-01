import type { Migration } from './types';

export const auditLedgerIdempotencyMigration: Migration = {
    id: '004',
    name: 'audit_ledger_idempotency',
    async up(sql) {
        await sql`
            CREATE TABLE IF NOT EXISTS audit_logs (
                id BIGSERIAL PRIMARY KEY,
                actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                actor_email VARCHAR(200),
                actor_role VARCHAR(30),
                action VARCHAR(120) NOT NULL,
                entity_type VARCHAR(80) NOT NULL,
                entity_id TEXT,
                before_state JSONB,
                after_state JSONB,
                metadata JSONB,
                ip_address TEXT,
                user_agent TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id, created_at DESC)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, created_at DESC)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC)`;

        await sql`
            CREATE TABLE IF NOT EXISTS payment_ledger_entries (
                id BIGSERIAL PRIMARY KEY,
                order_id INTEGER REFERENCES orders(id) ON DELETE RESTRICT,
                payment_transaction_id INTEGER REFERENCES payment_transactions(id) ON DELETE SET NULL,
                entry_type VARCHAR(50) NOT NULL,
                direction VARCHAR(10) NOT NULL CHECK (direction IN ('CREDIT', 'DEBIT')),
                amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
                currency VARCHAR(10) NOT NULL DEFAULT 'KES',
                reference TEXT,
                metadata JSONB,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await sql`CREATE INDEX IF NOT EXISTS idx_payment_ledger_order_id ON payment_ledger_entries(order_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_payment_ledger_transaction_id ON payment_ledger_entries(payment_transaction_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_payment_ledger_created_at ON payment_ledger_entries(created_at DESC)`;
        await sql`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_ledger_entry_reference
            ON payment_ledger_entries(entry_type, reference)
            WHERE reference IS NOT NULL
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS processed_payment_events (
                id BIGSERIAL PRIMARY KEY,
                provider VARCHAR(30) NOT NULL,
                event_key TEXT NOT NULL,
                payment_transaction_id INTEGER REFERENCES payment_transactions(id) ON DELETE SET NULL,
                raw_payload JSONB,
                processed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(provider, event_key)
            )
        `;

        await sql`CREATE INDEX IF NOT EXISTS idx_processed_payment_events_transaction_id ON processed_payment_events(payment_transaction_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_processed_payment_events_processed_at ON processed_payment_events(processed_at DESC)`;

        await sql`
            INSERT INTO payment_ledger_entries(
                order_id,
                payment_transaction_id,
                entry_type,
                direction,
                amount,
                currency,
                reference,
                metadata,
                created_at
            )
            SELECT
                o.id,
                pt.id,
                'PAYMENT_CAPTURED',
                'CREDIT',
                o.total_amount,
                COALESCE(pt.currency, 'KES'),
                COALESCE('pesapal:' || NULLIF(pt.confirmation_code, ''), 'legacy-order:' || o.id::text),
                jsonb_build_object('source', 'ledger_backfill', 'order_id', o.id),
                COALESCE(o.paid_at, o.updated_at, o.created_at)
            FROM orders o
            LEFT JOIN LATERAL (
                SELECT *
                FROM payment_transactions pt
                WHERE pt.order_id = o.id
                  AND pt.status = 'COMPLETED'
                ORDER BY pt.updated_at DESC
                LIMIT 1
            ) pt ON true
            WHERE o.payment_status = 'PAID'
            ON CONFLICT (entry_type, reference) WHERE reference IS NOT NULL DO NOTHING
        `;
    },
};
