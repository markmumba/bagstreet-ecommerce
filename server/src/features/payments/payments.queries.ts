import { sql } from '../../lib/db';
import { toJsonbParam } from '../../lib/json-column';

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
    }, db: typeof sql = sql): Promise<PaymentLedgerEntryRow | undefined> => {
        const [row] = await db<PaymentLedgerEntryRow[]>`
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

    findLedgerByOrderId: async (orderId: number): Promise<LedgerEntryRow[]> => {
        return await sql<LedgerEntryRow[]>`
            SELECT * FROM payment_ledger_entries WHERE order_id = ${orderId} ORDER BY created_at ASC, id ASC
        `;
    },
};
