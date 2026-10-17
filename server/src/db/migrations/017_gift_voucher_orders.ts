import type { Migration } from './types';

/**
 * Gift vouchers phase 2: buying a voucher online. The purchase is an Order with source
 * GIFT_VOUCHER (no items, no delivery) so it reuses the Pesapal payment handling; what was bought
 * lives in gift_voucher_orders, and the voucher is issued once the order is paid.
 */
export const giftVoucherOrdersMigration: Migration = {
    id: '017',
    name: 'gift_voucher_orders',
    async up(sql) {
        await sql`ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_source_check`;
        await sql`ALTER TABLE orders ADD CONSTRAINT orders_order_source_check CHECK (order_source IN ('ONLINE', 'WALK_IN', 'GIFT_VOUCHER'))`;

        await sql`
            CREATE TABLE IF NOT EXISTS gift_voucher_orders (
                order_id INTEGER PRIMARY KEY REFERENCES orders(id) ON DELETE RESTRICT,
                amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
                -- Who the code is emailed to: the recipient, or the buyer to hand over themselves.
                deliver_to TEXT NOT NULL CHECK (deliver_to IN ('RECIPIENT', 'BUYER')),
                recipient_name TEXT,
                recipient_email TEXT,
                message TEXT,
                voucher_id INTEGER UNIQUE REFERENCES gift_vouchers(id) ON DELETE RESTRICT,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await sql`ALTER TABLE gift_vouchers ADD COLUMN IF NOT EXISTS purchase_order_id INTEGER REFERENCES orders(id) ON DELETE RESTRICT`;

        await sql`ALTER TABLE gift_voucher_movements DROP CONSTRAINT IF EXISTS gift_voucher_movements_kind_check`;
        await sql`
            ALTER TABLE gift_voucher_movements ADD CONSTRAINT gift_voucher_movements_kind_check
            CHECK (kind IN ('ISSUED', 'HELD', 'REDEEMED', 'RELEASED', 'RETURNED', 'VOIDED', 'ADJUSTED', 'CODE_REPLACED'))
        `;
    },
};
