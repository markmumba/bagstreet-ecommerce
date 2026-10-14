import type { Migration } from './types';

/**
 * Gift vouchers (roadmap section 4, phase 1): money paid in advance and spent on orders. A voucher
 * is a way to pay, not a discount, so an order keeps its total and records how much the voucher
 * pays. Every balance change is a logged movement (CONTEXT.md › Gift vouchers).
 */
export const giftVouchersMigration: Migration = {
    id: '016',
    name: 'gift_vouchers',
    async up(sql) {
        await sql`
            CREATE TABLE IF NOT EXISTS gift_vouchers (
                id SERIAL PRIMARY KEY,
                -- SHA-256 of the normalised code; the code itself is shown once, when issued.
                code_hash TEXT NOT NULL UNIQUE,
                code_last4 TEXT NOT NULL,
                initial_amount NUMERIC(12, 2) NOT NULL CHECK (initial_amount > 0),
                balance NUMERIC(12, 2) NOT NULL CHECK (balance >= 0),
                currency TEXT NOT NULL DEFAULT 'KES',
                expires_at TIMESTAMP NOT NULL,
                voided_at TIMESTAMP,
                void_reason TEXT,
                voided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                recipient_name TEXT,
                recipient_phone TEXT,
                recipient_email TEXT,
                message TEXT,
                purchaser_name TEXT,
                -- How the voucher itself was paid for (a voucher sale is not an order).
                sold_via TEXT NOT NULL DEFAULT 'SHOP',
                sale_payment_method TEXT NOT NULL,
                sale_reference TEXT,
                issued_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await sql`
            CREATE TABLE IF NOT EXISTS gift_voucher_movements (
                id SERIAL PRIMARY KEY,
                voucher_id INTEGER NOT NULL REFERENCES gift_vouchers(id) ON DELETE RESTRICT,
                kind TEXT NOT NULL CHECK (kind IN ('ISSUED', 'HELD', 'REDEEMED', 'RELEASED', 'RETURNED', 'VOIDED', 'ADJUSTED')),
                -- Change to the balance (HELD is negative, REDEEMED is 0: it turns a hold into a spend).
                delta NUMERIC(12, 2) NOT NULL,
                -- The money concerned, always positive.
                amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
                balance_after NUMERIC(12, 2) NOT NULL,
                order_id INTEGER REFERENCES orders(id) ON DELETE RESTRICT,
                note TEXT,
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await sql`CREATE INDEX IF NOT EXISTS idx_gift_voucher_movements_voucher ON gift_voucher_movements(voucher_id, created_at)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_gift_voucher_movements_order ON gift_voucher_movements(order_id) WHERE order_id IS NOT NULL`;
        await sql`CREATE INDEX IF NOT EXISTS idx_gift_vouchers_created_at ON gift_vouchers(created_at DESC)`;

        await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS voucher_id INTEGER REFERENCES gift_vouchers(id) ON DELETE RESTRICT`;
        await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS voucher_amount NUMERIC(12, 2) NOT NULL DEFAULT 0`;
        await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS voucher_last4 TEXT`;
    },
};
