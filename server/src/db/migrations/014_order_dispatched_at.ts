import type { Migration } from './types';

/** When the rider left with the order ("Out for delivery"), for the order-to-dispatch launch metric. */
export const orderDispatchedAtMigration: Migration = {
    id: '014',
    name: 'order_dispatched_at',
    async up(sql) {
        await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMP`;
    },
};
