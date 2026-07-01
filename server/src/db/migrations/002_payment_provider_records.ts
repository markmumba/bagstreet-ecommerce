import type { Migration } from './types';

export const paymentProviderRecordsMigration: Migration = {
    id: '002',
    name: 'payment_provider_records',
    async up(sql) {
        await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email VARCHAR(200)`;

        await sql`
            CREATE TABLE IF NOT EXISTS payment_transactions (
                id SERIAL PRIMARY KEY,
                order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
                provider VARCHAR(30) NOT NULL,
                provider_reference TEXT,
                merchant_reference TEXT NOT NULL,
                checkout_url TEXT,
                amount DECIMAL(10,2) NOT NULL,
                currency VARCHAR(10) NOT NULL DEFAULT 'KES',
                status VARCHAR(20) NOT NULL DEFAULT 'INITIATED'
                    CHECK (status IN ('INITIATED','PENDING','COMPLETED','FAILED','CANCELLED','REVERSED')),
                payment_method VARCHAR(50),
                confirmation_code TEXT,
                result_desc TEXT,
                raw_payload JSONB,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(provider, merchant_reference)
            )
        `;

        await sql`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_transactions_provider_reference
            ON payment_transactions(provider, provider_reference)
            WHERE provider_reference IS NOT NULL
        `;
        await sql`CREATE INDEX IF NOT EXISTS idx_payment_transactions_order_id ON payment_transactions(order_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status)`;

        await sql`DROP TRIGGER IF EXISTS update_payment_transactions_updated_at ON payment_transactions`;
        await sql`
            CREATE TRIGGER update_payment_transactions_updated_at
            BEFORE UPDATE ON payment_transactions
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column()
        `;
    },
};
