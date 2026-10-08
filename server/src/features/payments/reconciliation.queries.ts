import { sql } from '../../lib/db';
import { LEDGER_ENTRY } from './order-balance';
import type { ReconciliationOrderRow } from './reconciliation';
import type { KnownTransaction } from './statement';

const num = (v: unknown) => Number(v ?? 0);

export const reconciliationQueries = {
    /** Ledger totals for entries dated in [from, to). */
    totals: async (from: Date, to: Date) => {
        const [row] = await sql<{ captured: string; refunded: string; reversed: string; fees: string; paid_orders: string }[]>`
            SELECT
                COALESCE(SUM(amount) FILTER (WHERE entry_type = ${LEDGER_ENTRY.PAYMENT_CAPTURED} AND direction = 'CREDIT'), 0) AS captured,
                COALESCE(SUM(amount) FILTER (WHERE entry_type = ${LEDGER_ENTRY.REFUND_ISSUED} AND direction = 'DEBIT'), 0) AS refunded,
                COALESCE(SUM(amount) FILTER (WHERE entry_type = ${LEDGER_ENTRY.PAYMENT_REVERSED} AND direction = 'DEBIT'), 0) AS reversed,
                COALESCE(SUM(amount) FILTER (WHERE entry_type = ${LEDGER_ENTRY.PROVIDER_FEE} AND direction = 'DEBIT'), 0) AS fees,
                COUNT(DISTINCT order_id) FILTER (WHERE entry_type = ${LEDGER_ENTRY.PAYMENT_CAPTURED}) AS paid_orders
            FROM payment_ledger_entries
            WHERE created_at >= ${from.toISOString()} AND created_at < ${to.toISOString()}
        `;
        return {
            captured: num(row?.captured),
            refunded: num(row?.refunded),
            reversed: num(row?.reversed),
            fees: num(row?.fees),
            paid_orders: num(row?.paid_orders),
        };
    },

    /** Money facts for every order with payment activity in [from, to). */
    ordersWithActivity: async (from: Date, to: Date): Promise<ReconciliationOrderRow[]> => {
        const rows = await sql<any[]>`
            WITH active AS (
                SELECT id AS order_id FROM orders
                WHERE paid_at >= ${from.toISOString()} AND paid_at < ${to.toISOString()}
                UNION
                SELECT order_id FROM payment_ledger_entries
                WHERE created_at >= ${from.toISOString()} AND created_at < ${to.toISOString()} AND order_id IS NOT NULL
                UNION
                SELECT order_id FROM payment_transactions
                WHERE status = 'COMPLETED' AND updated_at >= ${from.toISOString()} AND updated_at < ${to.toISOString()}
            )
            SELECT
                o.id AS order_id, o.order_number, o.total_amount, o.status, o.payment_status, o.order_source,
                COALESCE((SELECT SUM(amount) FROM payment_ledger_entries l
                          WHERE l.order_id = o.id AND l.entry_type = ${LEDGER_ENTRY.PAYMENT_CAPTURED} AND l.direction = 'CREDIT'), 0) AS captured,
                COALESCE((SELECT SUM(amount) FROM payment_ledger_entries l
                          WHERE l.order_id = o.id AND l.entry_type = ${LEDGER_ENTRY.REFUND_ISSUED} AND l.direction = 'DEBIT'), 0) AS refunded,
                COALESCE((SELECT SUM(amount) FROM payment_ledger_entries l
                          WHERE l.order_id = o.id AND l.entry_type = ${LEDGER_ENTRY.PAYMENT_REVERSED} AND l.direction = 'DEBIT'), 0) AS reversed,
                EXISTS (SELECT 1 FROM audit_logs a
                        WHERE a.entity_type = 'order' AND a.entity_id = o.id::text AND a.action = 'ORDER_REVERSAL_WRITTEN_OFF') AS reversal_written_off,
                EXISTS (SELECT 1 FROM payment_transactions t WHERE t.order_id = o.id AND t.status = 'COMPLETED') AS has_completed_provider_payment
            FROM orders o
            JOIN active a ON a.order_id = o.id
            ORDER BY o.id DESC
        `;
        return rows.map((r) => ({
            order_id: Number(r.order_id),
            order_number: r.order_number,
            total_amount: num(r.total_amount),
            status: r.status,
            payment_status: r.payment_status,
            order_source: r.order_source,
            captured: num(r.captured),
            refunded: num(r.refunded),
            reversed: num(r.reversed),
            reversal_written_off: Boolean(r.reversal_written_off),
            has_completed_provider_payment: Boolean(r.has_completed_provider_payment),
        }));
    },

    /** Every Pesapal transaction with its references and what the ledger captured for its order. */
    knownPesapalTransactions: async (): Promise<KnownTransaction[]> => {
        const rows = await sql<any[]>`
            SELECT
                t.id, t.order_id, o.order_number, t.provider_reference, t.merchant_reference, t.confirmation_code,
                COALESCE((SELECT SUM(amount) FROM payment_ledger_entries l
                          WHERE l.order_id = t.order_id AND l.entry_type = ${LEDGER_ENTRY.PAYMENT_CAPTURED} AND l.direction = 'CREDIT'), 0) AS captured
            FROM payment_transactions t
            JOIN orders o ON o.id = t.order_id
            WHERE t.provider = 'pesapal'
        `;
        return rows.map((r) => ({
            transactionId: Number(r.id),
            orderId: Number(r.order_id),
            orderNumber: r.order_number,
            references: [r.provider_reference, r.merchant_reference, r.confirmation_code].filter(Boolean),
            capturedAmount: num(r.captured),
        }));
    },

    /** Pesapal payments captured in [from, to] — to spot ones a statement for that period leaves out. */
    pesapalCapturesBetween: async (from: Date, to: Date) => {
        return await sql<{ transaction_id: number; order_number: string | null; reference: string | null; amount: string; created_at: string }[]>`
            SELECT DISTINCT ON (t.id)
                t.id AS transaction_id, o.order_number, COALESCE(t.provider_reference, t.merchant_reference) AS reference,
                l.amount, l.created_at
            FROM payment_ledger_entries l
            JOIN payment_transactions t ON t.order_id = l.order_id AND t.provider = 'pesapal' AND t.status = 'COMPLETED'
            JOIN orders o ON o.id = l.order_id
            WHERE l.entry_type = ${LEDGER_ENTRY.PAYMENT_CAPTURED}
              AND l.created_at >= ${from.toISOString()} AND l.created_at <= ${to.toISOString()}
            ORDER BY t.id, l.created_at
        `;
    },

    /** Records a Pesapal fee once per transaction; returns false if it was already recorded. */
    recordProviderFee: async (input: { orderId: number; transactionId: number; amount: number; statementRow: number; reference: string }) => {
        const rows = await sql<{ id: number }[]>`
            INSERT INTO payment_ledger_entries (order_id, payment_transaction_id, entry_type, direction, amount, currency, reference, metadata)
            VALUES (
                ${input.orderId}, ${input.transactionId}, ${LEDGER_ENTRY.PROVIDER_FEE}, 'DEBIT', ${input.amount}, 'KES',
                ${`fee:pesapal:${input.transactionId}`},
                ${JSON.stringify({ source: 'pesapal_statement', statement_row: input.statementRow, statement_reference: input.reference })}::jsonb
            )
            ON CONFLICT (entry_type, reference) WHERE reference IS NOT NULL DO NOTHING
            RETURNING id
        `;
        return rows.length > 0;
    },
};
