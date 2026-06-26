import { sql } from '../../lib/db';
import { ORDER_STATUS, PAYMENT_STATUS } from 'shared/dist';

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

interface MpesaC2BPaymentRow {
    id: number;
    transaction_id: string;
    phone: string;
    amount: string;
    bill_ref_number: string | null;
    raw_payload: any;
    matched_order_id: number | null;
    created_at: string;
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

    findRecentTransactionByOrderAndPhone: async (
        orderId: number,
        phone: string,
        seconds: number
    ): Promise<MpesaTransactionRow | undefined> => {
        const [row] = await sql<MpesaTransactionRow[]>`
            SELECT * FROM mpesa_transactions
            WHERE order_id = ${orderId}
              AND phone = ${phone}
              AND created_at >= NOW() - (${seconds} || ' seconds')::interval
            ORDER BY created_at DESC LIMIT 1
        `;
        return row;
    },

    createC2BPayment: async (data: {
        transaction_id: string;
        phone: string;
        amount: number;
        bill_ref_number?: string | null;
        raw_payload: any;
    }): Promise<MpesaC2BPaymentRow> => {
        const [row] = await sql<MpesaC2BPaymentRow[]>`
            INSERT INTO mpesa_c2b_payments
                (transaction_id, phone, amount, bill_ref_number, raw_payload)
            VALUES (
                ${data.transaction_id},
                ${data.phone},
                ${data.amount},
                ${data.bill_ref_number ?? null},
                ${JSON.stringify(data.raw_payload)}::jsonb
            )
            ON CONFLICT (transaction_id) DO UPDATE
            SET raw_payload = EXCLUDED.raw_payload
            RETURNING *
        `;
        return row!;
    },

    findRecentC2BMatch: async (
        phone: string,
        amount: number,
        minutes = 15
    ): Promise<MpesaC2BPaymentRow | undefined> => {
        const [row] = await sql<MpesaC2BPaymentRow[]>`
            SELECT * FROM mpesa_c2b_payments
            WHERE phone = ${phone}
              AND amount = ${amount}
              AND matched_order_id IS NULL
              AND created_at >= NOW() - (${minutes} || ' minutes')::interval
            ORDER BY created_at DESC LIMIT 1
        `;
        return row;
    },

    markC2BMatched: async (paymentId: number, orderId: number): Promise<void> => {
        await sql`
            UPDATE mpesa_c2b_payments
            SET matched_order_id = ${orderId}
            WHERE id = ${paymentId}
        `;
    },

    markOrderPaid: async (orderId: number): Promise<void> => {
        await sql`
            UPDATE orders
            SET payment_status = ${PAYMENT_STATUS.PAID}, status = ${ORDER_STATUS.CONFIRMED}
            WHERE id = ${orderId}
        `;
    },

    markOrderFailed: async (orderId: number): Promise<void> => {
        await sql`
            UPDATE orders SET payment_status = ${PAYMENT_STATUS.FAILED} WHERE id = ${orderId}
        `;
    },
};
