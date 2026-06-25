import { sql } from '../../lib/db';

interface MpesaTransactionRow {
    id: number;
    order_id: number;
    checkout_request_id: string;
    merchant_request_id: string;
    phone: string;
    amount: string;
    status: string;
    result_code: number | null;
    result_desc: string | null;
    mpesa_receipt_number: string | null;
    created_at: string;
    updated_at: string;
}

export const paymentsQueries = {
    createTransaction: async (
        orderId: number,
        checkoutRequestId: string,
        merchantRequestId: string,
        phone: string,
        amount: number
    ): Promise<MpesaTransactionRow> => {
        const [row] = await sql<MpesaTransactionRow[]>`
            INSERT INTO mpesa_transactions
                (order_id, checkout_request_id, merchant_request_id, phone, amount)
            VALUES (${orderId}, ${checkoutRequestId}, ${merchantRequestId}, ${phone}, ${amount})
            RETURNING *
        `;
        return row!;
    },

    findByCheckoutRequestId: async (checkoutRequestId: string): Promise<MpesaTransactionRow | undefined> => {
        const [row] = await sql<MpesaTransactionRow[]>`
            SELECT * FROM mpesa_transactions WHERE checkout_request_id = ${checkoutRequestId}
        `;
        return row;
    },

    findByOrderId: async (orderId: number): Promise<MpesaTransactionRow | undefined> => {
        const [row] = await sql<MpesaTransactionRow[]>`
            SELECT * FROM mpesa_transactions WHERE order_id = ${orderId}
            ORDER BY created_at DESC LIMIT 1
        `;
        return row;
    },

    updateTransaction: async (
        id: number,
        data: {
            status: string;
            result_code?: number;
            result_desc?: string;
            mpesa_receipt_number?: string;
        }
    ): Promise<void> => {
        await sql`
            UPDATE mpesa_transactions
            SET
                status = ${data.status},
                result_code = ${data.result_code ?? null},
                result_desc = ${data.result_desc ?? null},
                mpesa_receipt_number = ${data.mpesa_receipt_number ?? null}
            WHERE id = ${id}
        `;
    },

    markOrderPaid: async (orderId: number): Promise<void> => {
        await sql`
            UPDATE orders
            SET payment_status = 'PAID', status = 'CONFIRMED'
            WHERE id = ${orderId}
        `;
    },

    markOrderFailed: async (orderId: number): Promise<void> => {
        await sql`
            UPDATE orders SET payment_status = 'FAILED' WHERE id = ${orderId}
        `;
    },
};
