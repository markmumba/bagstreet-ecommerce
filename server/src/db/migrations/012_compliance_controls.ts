import type { Migration } from './types';

export const complianceControlsMigration: Migration = {
    id: '012', name: 'compliance_controls',
    async up(sql) {
        await sql`CREATE TABLE order_policy_acceptances (
            order_id INTEGER PRIMARY KEY REFERENCES orders(id) ON DELETE RESTRICT,
            policy_version TEXT NOT NULL, policy_snapshot JSONB NOT NULL,
            accepted_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
        await sql`CREATE TABLE privacy_requests (
            id UUID PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            email VARCHAR(254) NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('ACCESS','CORRECTION','ERASURE','OBJECTION')),
            status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','COMPLETED','REJECTED')),
            details TEXT NOT NULL, identity_verified_at TIMESTAMPTZ, resolution TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(), resolved_at TIMESTAMPTZ
        )`;
        await sql`CREATE INDEX privacy_requests_status_date ON privacy_requests(status, created_at)`;
        await sql`CREATE INDEX privacy_requests_user ON privacy_requests(user_id)`;
        await sql`CREATE TABLE compliance_incidents (
            id UUID PRIMARY KEY, title TEXT NOT NULL, severity TEXT NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
            status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CONTAINED','CLOSED')),
            aware_at TIMESTAMPTZ NOT NULL, review_due_at TIMESTAMPTZ NOT NULL,
            summary TEXT NOT NULL, notification_decision TEXT NOT NULL DEFAULT 'PENDING'
                CHECK (notification_decision IN ('PENDING','REQUIRED','NOT_REQUIRED')),
            decision_reason TEXT, regulator_notified_at TIMESTAMPTZ, customers_notified_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
        await sql`CREATE TABLE product_compliance_evidence (
            product_id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE RESTRICT,
            supplier TEXT NOT NULL, invoice_reference TEXT NOT NULL, authenticity_evidence TEXT NOT NULL,
            image_rights TEXT NOT NULL, notes TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
        await sql`CREATE TABLE compliance_export_records (
            id UUID PRIMARY KEY, actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            month TEXT NOT NULL, dataset TEXT NOT NULL, row_count INTEGER NOT NULL,
            sha256 TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
    },
};
