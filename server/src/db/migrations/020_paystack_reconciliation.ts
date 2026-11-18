import type { Migration } from './types';

/**
 * Daily Paystack reconciliation (18 Nov 2026). One run row per Nairobi day, so the job knows
 * which days are done and a rerun is safe; one issue row per (day, kind, reference), so a rerun
 * alerts staff only about problems it hasn't reported before.
 */
export const paystackReconciliationMigration: Migration = {
    id: '020',
    name: 'paystack_reconciliation',
    async up(sql) {
        await sql`
            CREATE TABLE IF NOT EXISTS paystack_reconciliation_runs (
                day DATE PRIMARY KEY,
                status VARCHAR(20) NOT NULL CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED')),
                attempts INTEGER NOT NULL DEFAULT 1,
                started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                finished_at TIMESTAMP,
                summary JSONB,
                error TEXT
            )
        `;
        await sql`
            CREATE TABLE IF NOT EXISTS paystack_reconciliation_issues (
                id SERIAL PRIMARY KEY,
                day DATE NOT NULL,
                kind VARCHAR(40) NOT NULL,
                reference VARCHAR(255) NOT NULL,
                order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
                paystack_amount NUMERIC(12, 2),
                our_amount NUMERIC(12, 2),
                message TEXT NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (day, kind, reference)
            )
        `;
        await sql`CREATE INDEX IF NOT EXISTS idx_paystack_recon_issues_day ON paystack_reconciliation_issues(day)`;
    },
};
