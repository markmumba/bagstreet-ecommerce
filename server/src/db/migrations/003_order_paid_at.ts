import type { Migration } from './types';

export const orderPaidAtMigration: Migration = {
    id: '003',
    name: 'order_paid_at',
    async up(sql) {
        await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP`;
        await sql`
            UPDATE orders
            SET paid_at = COALESCE(paid_at, updated_at, created_at)
            WHERE payment_status = 'PAID'
              AND paid_at IS NULL
        `;
        await sql`CREATE INDEX IF NOT EXISTS idx_orders_paid_at ON orders(paid_at DESC)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_orders_payment_status_status ON orders(payment_status, status)`;
    },
};
