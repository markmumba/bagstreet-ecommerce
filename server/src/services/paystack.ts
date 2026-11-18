import { env } from '../config/env';
import { Bulkhead, CircuitBreaker, fetchWithTimeout } from '../lib/resilience';
import { paystackPhone, toSubunits } from './paystack-protocol';
import { PAYMENT_PROVIDER } from '../features/payments/attempt-status';

const BASE_URL = 'https://api.paystack.co';

const PROVIDER = PAYMENT_PROVIDER.PAYSTACK;

export const paystackCircuit = new CircuitBreaker({
    name: PROVIDER,
    failureThreshold: 5,
    resetTimeoutMs: 30_000,
    halfOpenMaxCalls: 2,
});

export const paystackBulkhead = new Bulkhead(PROVIDER, 10);

/** Mock references start with this when Paystack isn't configured (development only). */
const MOCK_PREFIX = 'mock-paystack-';

export function isPaystackConfigured() {
    return Boolean(env.PAYSTACK_SECRET_KEY);
}

/** Calls Paystack with the secret key; returns the parsed body whatever the status. */
async function paystackRequest(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; ok: boolean; data: any }> {
    const res = await paystackBulkhead.execute(() =>
        paystackCircuit.execute(() =>
            fetchWithTimeout(
                `${BASE_URL}${path}`,
                {
                    method,
                    headers: {
                        Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
                        'Content-Type': 'application/json',
                    },
                    body: body === undefined ? undefined : JSON.stringify(body),
                },
                env.PAYSTACK_TIMEOUT_MS,
            )
        )
    );
    const data = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, data };
}

export interface MpesaChargeResult {
    reference: string;
    /** The amount asked for, in shillings (whole: M-Pesa takes no cents). */
    amount: number;
    /** Paystack's instruction for the customer, e.g. "Please complete authorization process on your mobile phone". */
    displayText: string | null;
    raw: unknown;
}

/**
 * Sends the M-Pesa PIN prompt through Paystack. `phone` must already be in 2547… form and
 * `reference` unique to this attempt.
 */
export async function chargeMpesa(params: {
    reference: string;
    amount: number;
    phone: string;
    email: string;
    metadata: Record<string, unknown>;
}): Promise<MpesaChargeResult> {
    const subunits = toSubunits(params.amount);

    if (!isPaystackConfigured()) {
        if (env.NODE_ENV === 'production') throw new Error('Paystack is not configured');
        console.log(`[DEV] Paystack M-Pesa charge skipped: KES ${subunits / 100} to ${params.phone} (${params.reference})`);
        return { reference: `${MOCK_PREFIX}${params.reference}`, amount: subunits / 100, displayText: null, raw: null };
    }

    const { status, ok, data } = await paystackRequest('POST', '/charge', {
        email: params.email,
        amount: String(subunits),
        currency: env.CURRENCY,
        reference: params.reference,
        metadata: params.metadata,
        mobile_money: { phone: paystackPhone(params.phone), provider: 'mpesa' },
    });

    // `status: true` means Paystack accepted the request; data.status says what happens next
    // (pay_offline / pending: the prompt is on its way). A failed charge comes back immediately.
    const chargeStatus = data?.data?.status;
    if (!ok || data?.status !== true || chargeStatus === 'failed') {
        throw new Error(`Paystack charge failed: ${status} ${data?.data?.message ?? data?.message ?? ''}`.trim());
    }

    return {
        reference: data.data.reference ?? params.reference,
        amount: subunits / 100,
        displayText: data.data.display_text ?? null,
        raw: data,
    };
}

/** One transaction from Paystack's List Transactions API, as much as reconciliation needs. */
export interface PaystackListedTransaction {
    reference: string;
    /** success, failed, abandoned, reversed, pending, ongoing, … */
    status: string;
    /** In shillings (Paystack sends cents). */
    amount: number;
    currency: string;
    createdAt: string | null;
    raw: unknown;
}

/** Page size for List Transactions (Paystack's maximum is 100). */
const LIST_PAGE_SIZE = 100;
/** A day's worth for a small shop is a page or two; stop rather than loop forever on a bad `meta`. */
const LIST_MAX_PAGES = 50;

/**
 * Every Paystack transaction created in [from, to], all statuses. Empty when Paystack isn't
 * configured (development). Throws if any page fails, so a partial list is never reconciled.
 */
export async function listTransactions(from: Date, to: Date): Promise<PaystackListedTransaction[]> {
    if (!isPaystackConfigured()) {
        if (env.NODE_ENV === 'production') throw new Error('Paystack is not configured');
        return [];
    }

    const all: PaystackListedTransaction[] = [];
    for (let page = 1; page <= LIST_MAX_PAGES; page++) {
        const query = new URLSearchParams({
            perPage: String(LIST_PAGE_SIZE),
            page: String(page),
            from: from.toISOString(),
            to: to.toISOString(),
        });
        const { status, ok, data } = await paystackRequest('GET', `/transaction?${query}`);
        if (!ok || data?.status !== true || !Array.isArray(data?.data)) {
            throw new Error(`Paystack list transactions failed: ${status} ${data?.message ?? ''}`.trim());
        }
        for (const t of data.data) {
            if (typeof t?.reference !== 'string' || typeof t?.status !== 'string') continue;
            all.push({
                reference: t.reference,
                status: t.status,
                amount: Number(t.amount) / 100,
                currency: String(t.currency ?? env.CURRENCY),
                createdAt: t.created_at ?? t.createdAt ?? null,
                raw: t,
            });
        }
        const pageCount = Number(data?.meta?.pageCount ?? 1);
        if (data.data.length < LIST_PAGE_SIZE || page >= pageCount) return all;
    }
    throw new Error(`Paystack list transactions: more than ${LIST_MAX_PAGES} pages, refusing a partial list`);
}

/**
 * Asks Paystack how a charge stands. Returns the transaction `data` (see outcomeOfTransaction),
 * or null when Paystack doesn't know the reference yet (just after the charge).
 */
export async function verifyTransaction(reference: string): Promise<{ data: unknown; raw: unknown } | null> {
    if (reference.startsWith(MOCK_PREFIX)) {
        return { data: { status: 'pending', reference }, raw: null };
    }

    const { status, ok, data } = await paystackRequest('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
    if (status === 400 || status === 404) {
        if (String(data?.message ?? '').toLowerCase().includes('not found')) return null;
    }
    if (!ok || data?.status !== true || !data?.data) {
        throw new Error(`Paystack verify failed: ${status} ${data?.message ?? ''}`.trim());
    }
    return { data: data.data, raw: data };
}
