import { sql } from '../../lib/db';
import { toJsonbParam } from '../../lib/json-column';
import { ORDER_STATUS, PAYMENT_STATUS } from 'shared/dist';
import type { RefundMethod } from 'shared/dist';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { roundMoney } from '../../lib/pricing';
import { LEDGER_ENTRY, summariseOrderPayments, type BalanceEntry } from './order-balance';

export interface LedgerEntryRow {
    id: number;
    order_id: number;
    payment_transaction_id: number | null;
    entry_type: string;
    direction: 'CREDIT' | 'DEBIT';
    amount: string;
    currency: string;
    reference: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
}

export interface RecordRefundInput {
    orderId: number;
    amount: number;
    method: RefundMethod;
    externalReference?: string | null;
    reason: string;
    idempotencyKey: string;
    recordedBy: { id: string; email?: string | null };
}

export interface RecordRefundResult {
    /** False when this idempotency key was already used (double-submit): nothing new was written. */
    recorded: boolean;
    statusChangedTo: string | null;
}

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
                ${toJsonbParam(data.raw_payload)}::jsonb
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
                raw_payload = ${toJsonbParam(data.raw_payload)}::jsonb
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
                ${toJsonbParam(data.raw_payload)}::jsonb
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
                ${toJsonbParam(data.metadata)}::jsonb
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
                ${toJsonbParam(data.raw_payload)}::jsonb
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
              AND status <> ${ORDER_STATUS.CANCELLED}
            RETURNING id
        `;
        return Boolean(row);
    },

    /**
     * Records money received for an order that stays cancelled (it expired and its stock is gone).
     * Staff must refund it; returns false if it was already recorded.
     */
    markCancelledOrderPaid: async (orderId: number): Promise<boolean> => {
        const [row] = await sql<{ id: number }[]>`
            UPDATE orders
            SET payment_status = ${PAYMENT_STATUS.PAID}, paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP)
            WHERE id = ${orderId}
              AND status = ${ORDER_STATUS.CANCELLED}
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

    findLedgerByOrderId: async (orderId: number): Promise<LedgerEntryRow[]> => {
        return await sql<LedgerEntryRow[]>`
            SELECT * FROM payment_ledger_entries WHERE order_id = ${orderId} ORDER BY created_at ASC, id ASC
        `;
    },

    /**
     * Records money returned to a customer. Locks the order row so two admins (or a double click)
     * can't refund more than was received, and checks the limit against the ledger inside the same
     * transaction. Marks the order REFUNDED once nothing is left to refund (cancelled orders stay cancelled).
     */
    recordRefund: async (input: RecordRefundInput): Promise<RecordRefundResult> => {
        return await sql.begin(async (tx: typeof sql) => {
            const [order] = await tx<{ id: number; total_amount: string; status: string; payment_status: string }[]>`
                SELECT id, total_amount, status, payment_status FROM orders WHERE id = ${input.orderId} FOR UPDATE
            `;
            if (!order) throw new NotFoundError('Order', input.orderId);
            if (order.payment_status !== PAYMENT_STATUS.PAID) {
                throw new BadRequestError('Only paid orders can be refunded');
            }

            const reference = `refund:${input.idempotencyKey}`;
            const [duplicate] = await tx`
                SELECT id FROM payment_ledger_entries
                WHERE entry_type = ${LEDGER_ENTRY.REFUND_ISSUED} AND reference = ${reference}
            `;
            if (duplicate) return { recorded: false, statusChangedTo: null };

            const entries = await tx<BalanceEntry[]>`
                SELECT entry_type, direction, amount FROM payment_ledger_entries WHERE order_id = ${input.orderId}
            `;
            const before = summariseOrderPayments(order, entries);
            const amount = roundMoney(input.amount);
            if (amount <= 0) throw new BadRequestError('Refund amount must be more than zero');
            if (amount > before.refundable) {
                throw new BadRequestError(
                    before.refundable > 0
                        ? `Only KES ${before.refundable.toFixed(2)} can still be refunded on this order`
                        : 'This order has already been fully refunded',
                );
            }

            await tx`
                INSERT INTO payment_ledger_entries (order_id, entry_type, direction, amount, currency, reference, metadata)
                VALUES (
                    ${input.orderId}, ${LEDGER_ENTRY.REFUND_ISSUED}, 'DEBIT', ${amount}, 'KES', ${reference},
                    ${toJsonbParam({
                        method: input.method,
                        external_reference: input.externalReference || null,
                        reason: input.reason,
                        recorded_by: input.recordedBy.id,
                        recorded_by_email: input.recordedBy.email ?? null,
                        legacy_unrecorded_capture: before.legacy_unrecorded_capture,
                    })}::jsonb
                )
            `;

            const after = summariseOrderPayments(order, [...entries, { entry_type: LEDGER_ENTRY.REFUND_ISSUED, direction: 'DEBIT', amount }]);
            let statusChangedTo: string | null = null;
            if (after.state === 'refunded' && order.status !== ORDER_STATUS.CANCELLED && order.status !== ORDER_STATUS.REFUNDED) {
                await tx`UPDATE orders SET status = ${ORDER_STATUS.REFUNDED}, updated_at = CURRENT_TIMESTAMP WHERE id = ${input.orderId}`;
                statusChangedTo = ORDER_STATUS.REFUNDED;
            }
            return { recorded: true, statusChangedTo };
        }) as unknown as Promise<RecordRefundResult>;
    },
};
