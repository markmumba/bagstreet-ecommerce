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

export interface PaymentTransactionRow {
    id: number;
    order_id: number;
    provider: string;
    provider_reference: string | null;
    merchant_reference: string;
    checkout_url: string | null;
    amount: string;
    currency: string;
    status: string;
    payment_method: string | null;
    confirmation_code: string | null;
    result_desc: string | null;
    raw_payload: any;
    created_at: string;
    updated_at: string;
}

export interface PaymentLedgerEntryRow {
    id: number;
    order_id: number | null;
    payment_transaction_id: number | null;
    entry_type: string;
    direction: 'CREDIT' | 'DEBIT';
    amount: string;
    currency: string;
    reference: string | null;
    metadata: any;
    created_at: string;
}

export const paymentsQueries = {
    createProviderTransaction: async (data: {
        order_id: number;
        provider: string;
        provider_reference?: string | null;
        merchant_reference: string;
        checkout_url?: string | null;
        amount: number;
        currency: string;
        status?: string;
        raw_payload?: unknown;
    }): Promise<PaymentTransactionRow> => {
        const [row] = await sql<PaymentTransactionRow[]>`
            INSERT INTO payment_transactions(
                order_id, provider, provider_reference, merchant_reference,
                checkout_url, amount, currency, status, raw_payload
            )
            VALUES (
                ${data.order_id},
                ${data.provider},
                ${data.provider_reference ?? null},
                ${data.merchant_reference},
                ${data.checkout_url ?? null},
                ${data.amount},
                ${data.currency},
                ${data.status ?? 'INITIATED'},
                ${data.raw_payload == null ? null : JSON.stringify(data.raw_payload)}::jsonb
            )
            ON CONFLICT (provider, merchant_reference) DO UPDATE
            SET
                provider_reference = EXCLUDED.provider_reference,
                checkout_url = EXCLUDED.checkout_url,
                amount = EXCLUDED.amount,
                currency = EXCLUDED.currency,
                status = EXCLUDED.status,
                raw_payload = EXCLUDED.raw_payload
            RETURNING *
        `;
        return row!;
    },

    findProviderTransactionByReference: async (
        provider: string,
        providerReference: string
    ): Promise<PaymentTransactionRow | undefined> => {
        const [row] = await sql<PaymentTransactionRow[]>`
            SELECT * FROM payment_transactions
            WHERE provider = ${provider}
              AND provider_reference = ${providerReference}
            ORDER BY created_at DESC
            LIMIT 1
        `;
        return row;
    },

    findProviderTransactionByOrderId: async (
        orderId: number,
        provider?: string
    ): Promise<PaymentTransactionRow | undefined> => {
        const [row] = await sql<PaymentTransactionRow[]>`
            SELECT * FROM payment_transactions
            WHERE order_id = ${orderId}
              AND (${provider ?? null}::text IS NULL OR provider = ${provider ?? null}::text)
            ORDER BY created_at DESC
            LIMIT 1
        `;
        return row;
    },

    updateProviderTransaction: async (
        id: number,
        data: {
            status: string;
            payment_method?: string | null;
            confirmation_code?: string | null;
            result_desc?: string | null;
            raw_payload?: unknown;
        }
    ): Promise<void> => {
        await sql`
            UPDATE payment_transactions
            SET
                status = ${data.status},
                payment_method = ${data.payment_method ?? null},
                confirmation_code = ${data.confirmation_code ?? null},
                result_desc = ${data.result_desc ?? null},
                raw_payload = ${data.raw_payload == null ? null : JSON.stringify(data.raw_payload)}::jsonb
            WHERE id = ${id}
        `;
    },

    createProcessedPaymentEvent: async (data: {
        provider: string;
        event_key: string;
        payment_transaction_id?: number | null;
        raw_payload?: unknown;
    }): Promise<boolean> => {
        const [row] = await sql<{ id: number }[]>`
            INSERT INTO processed_payment_events(provider, event_key, payment_transaction_id, raw_payload)
            VALUES (
                ${data.provider},
                ${data.event_key},
                ${data.payment_transaction_id ?? null},
                ${data.raw_payload == null ? null : JSON.stringify(data.raw_payload)}::jsonb
            )
            ON CONFLICT (provider, event_key) DO NOTHING
            RETURNING id
        `;
        return Boolean(row);
    },

    createLedgerEntry: async (data: {
        order_id?: number | null;
        payment_transaction_id?: number | null;
        entry_type: string;
        direction: 'CREDIT' | 'DEBIT';
        amount: number;
        currency: string;
        reference?: string | null;
        metadata?: unknown;
    }): Promise<PaymentLedgerEntryRow | undefined> => {
        const [row] = await sql<PaymentLedgerEntryRow[]>`
            INSERT INTO payment_ledger_entries(
                order_id,
                payment_transaction_id,
                entry_type,
                direction,
                amount,
                currency,
                reference,
                metadata
            )
            VALUES (
                ${data.order_id ?? null},
                ${data.payment_transaction_id ?? null},
                ${data.entry_type},
                ${data.direction},
                ${data.amount},
                ${data.currency},
                ${data.reference ?? null},
                ${data.metadata == null ? null : JSON.stringify(data.metadata)}::jsonb
            )
            ON CONFLICT (entry_type, reference) WHERE reference IS NOT NULL DO NOTHING
            RETURNING *
        `;
        return row;
    },

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

    markOrderPaid: async (orderId: number): Promise<boolean> => {
        const [row] = await sql<{ id: number }[]>`
            UPDATE orders
            SET
                payment_status = ${PAYMENT_STATUS.PAID},
                status = ${ORDER_STATUS.CONFIRMED},
                paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP)
            WHERE id = ${orderId}
              AND payment_status <> ${PAYMENT_STATUS.PAID}
            RETURNING id
        `;
        return Boolean(row);
    },

    markOrderFailed: async (orderId: number): Promise<void> => {
        await sql`
            UPDATE orders SET payment_status = ${PAYMENT_STATUS.FAILED} WHERE id = ${orderId}
        `;
    },
};
