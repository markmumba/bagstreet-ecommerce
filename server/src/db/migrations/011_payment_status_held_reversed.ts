import type { Migration } from './types';

/**
 * "Held" (money received but not the amount owed) and "reversed" (captured money taken back by the
 * provider) become real payment statuses, owned by the Order lifecycle (docs/adr/0001). Held orders
 * used to be inferred from the ledger: an unpaid order with a captured payment. Convert those.
 */
export const paymentStatusHeldReversedMigration: Migration = {
    id: '011',
    name: 'payment_status_held_reversed',
    async up(sql) {
        await sql`ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check`;
        await sql`
            ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check
            CHECK (payment_status IN ('UNPAID', 'PAID', 'FAILED', 'HELD', 'REVERSED'))
        `;
        await sql`
            UPDATE orders o SET payment_status = 'HELD'
            WHERE o.payment_status IN ('UNPAID', 'FAILED')
              AND EXISTS (
                  SELECT 1 FROM payment_ledger_entries l
                  WHERE l.order_id = o.id AND l.entry_type = 'PAYMENT_CAPTURED' AND l.direction = 'CREDIT'
              )
        `;
    },
};
