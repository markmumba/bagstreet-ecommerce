import type { Migration } from './types';

export const walkInSalesMigration: Migration = {
    id: '006',
    name: 'walk_in_sales',
    async up(sql) {
        await sql`
            ALTER TABLE orders
            ADD COLUMN IF NOT EXISTS order_source VARCHAR(20) NOT NULL DEFAULT 'ONLINE'
        `;

        await sql`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'orders_order_source_check'
                ) THEN
                    ALTER TABLE orders
                    ADD CONSTRAINT orders_order_source_check
                    CHECK (order_source IN ('ONLINE','WALK_IN'));
                END IF;
            END $$;
        `;

        await sql`CREATE INDEX IF NOT EXISTS idx_orders_order_source ON orders(order_source)`;
    },
};
