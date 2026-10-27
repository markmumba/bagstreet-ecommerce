import { env } from '../config/env';
import { Bulkhead, CircuitBreaker, fetchWithTimeout } from '../lib/resilience';
import {
    accountReference,
    darajaTimestamp,
    parseStkQuery,
    stkAmount,
    stkPassword,
    type StkOutcome,
} from './mpesa-protocol';

const BASE_URL = env.MPESA_ENV === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';

const PROVIDER = 'mpesa';

export const mpesaCircuit = new CircuitBreaker({
    name: PROVIDER,
    failureThreshold: 5,
    resetTimeoutMs: 30_000,
    halfOpenMaxCalls: 2,
});

export const mpesaBulkhead = new Bulkhead(PROVIDER, 10);

/** Mock references start with this when M-Pesa isn't configured (development only). */
const MOCK_PREFIX = 'mock-mpesa-';

export function isMpesaConfigured() {
    return Boolean(env.MPESA_CONSUMER_KEY && env.MPESA_CONSUMER_SECRET && env.MPESA_SHORTCODE && env.MPESA_PASSKEY);
}

function callbackUrl() {
    const base = env.MPESA_CALLBACK_URL ?? `${env.SERVER_URL}/api/payments/mpesa/callback`;
    return env.MPESA_CALLBACK_SECRET ? `${base.replace(/\/$/, '')}/${env.MPESA_CALLBACK_SECRET}` : base;
}

// ── Access token ────────────────────────────────────────────────────────────
// A token lasts an hour. One is fetched and shared by every request until shortly before it
// expires (or Daraja rejects it), and concurrent requests wait on the same fetch.

let cachedToken: { value: string; expiresAt: number } | null = null;
let tokenRequest: Promise<string> | null = null;

/** Refresh this long before Daraja's stated expiry, so a token never lapses mid-request. */
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

async function requestToken(): Promise<string> {
    const credentials = Buffer.from(`${env.MPESA_CONSUMER_KEY}:${env.MPESA_CONSUMER_SECRET}`).toString('base64');
    const res = await mpesaBulkhead.execute(() =>
        mpesaCircuit.execute(() =>
            fetchWithTimeout(
                `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
                { method: 'GET', headers: { Authorization: `Basic ${credentials}` } },
                env.MPESA_TIMEOUT_MS,
            )
        )
    );

    const data = await res.json().catch(() => ({})) as { access_token?: string; expires_in?: string | number; errorMessage?: string };
    if (!res.ok || !data.access_token) {
        throw new Error(`M-Pesa authentication failed: ${res.status} ${data.errorMessage ?? ''}`.trim());
    }

    const lifetimeMs = (Number(data.expires_in) || 3599) * 1000;
    cachedToken = { value: data.access_token, expiresAt: Date.now() + lifetimeMs - TOKEN_EXPIRY_MARGIN_MS };
    return data.access_token;
}

async function accessToken(): Promise<string> {
    if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
    tokenRequest ??= requestToken().finally(() => { tokenRequest = null; });
    return tokenRequest;
}

/** Daraja's answer when the token was revoked or expired early. */
function isTokenRejected(status: number, data: any) {
    return status === 401 || data?.errorCode === '404.001.03';
}

/** POSTs to Daraja with the shared token, fetching a fresh one once if the cached one is rejected. */
async function darajaPost(path: string, body: unknown): Promise<{ status: number; ok: boolean; data: any }> {
    for (let attempt = 0; ; attempt++) {
        const token = await accessToken();
        const res = await mpesaBulkhead.execute(() =>
            mpesaCircuit.execute(() =>
                fetchWithTimeout(
                    `${BASE_URL}${path}`,
                    {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                    },
                    env.MPESA_TIMEOUT_MS,
                )
            )
        );
        const data = await res.json().catch(() => null);
        if (attempt === 0 && isTokenRejected(res.status, data)) {
            cachedToken = null;
            continue;
        }
        return { status: res.status, ok: res.ok, data };
    }
}

function credentialsFor(now = new Date()) {
    const timestamp = darajaTimestamp(now);
    return {
        BusinessShortCode: env.MPESA_SHORTCODE!,
        Password: stkPassword(env.MPESA_SHORTCODE!, env.MPESA_PASSKEY!, timestamp),
        Timestamp: timestamp,
    };
}

// ── STK Push ────────────────────────────────────────────────────────────────

export interface StkPushResult {
    checkoutRequestId: string;
    merchantRequestId: string;
    /** The whole-shilling amount the customer is asked to pay. */
    amount: number;
    customerMessage: string | null;
    raw: unknown;
}

/** Sends the PIN prompt to the customer's phone. `phone` must already be in 2547… form. */
export async function sendStkPush(params: { orderNumber: string; amount: number; phone: string }): Promise<StkPushResult> {
    const amount = stkAmount(params.amount);

    if (!isMpesaConfigured()) {
        if (env.NODE_ENV === 'production') throw new Error('M-Pesa is not configured');
        console.log(`[DEV] M-Pesa STK push skipped: KES ${amount} to ${params.phone} for ${params.orderNumber}`);
        const id = `${MOCK_PREFIX}${params.orderNumber}-${Date.now()}`;
        return { checkoutRequestId: id, merchantRequestId: id, amount, customerMessage: null, raw: null };
    }

    const { status, ok, data } = await darajaPost('/mpesa/stkpush/v1/processrequest', {
        ...credentialsFor(),
        TransactionType: env.MPESA_TRANSACTION_TYPE,
        Amount: amount,
        PartyA: params.phone,
        PartyB: env.MPESA_PARTY_B ?? env.MPESA_SHORTCODE,
        PhoneNumber: params.phone,
        CallBackURL: callbackUrl(),
        AccountReference: accountReference(params.orderNumber),
        TransactionDesc: `Order ${params.orderNumber}`.slice(0, 13),
    });

    if (!ok || String(data?.ResponseCode) !== '0' || !data?.CheckoutRequestID) {
        throw new Error(`M-Pesa STK push failed: ${status} ${data?.errorMessage ?? data?.ResponseDescription ?? ''}`.trim());
    }

    return {
        checkoutRequestId: data.CheckoutRequestID,
        merchantRequestId: data.MerchantRequestID ?? '',
        amount,
        customerMessage: data.CustomerMessage ?? null,
        raw: data,
    };
}

// ── STK Push Query ──────────────────────────────────────────────────────────

/**
 * Asks Safaricom how an STK Push ended. Used when the callback hasn't arrived (or to verify one —
 * callbacks aren't signed, so a payment is only accepted once this confirms it).
 */
export async function queryStkPush(checkoutRequestId: string): Promise<{ outcome: StkOutcome; resultDesc: string | null; raw: unknown }> {
    if (checkoutRequestId.startsWith(MOCK_PREFIX)) {
        return { outcome: { state: 'pending' }, resultDesc: null, raw: null };
    }

    const { status, data } = await darajaPost('/mpesa/stkpushquery/v1/query', {
        ...credentialsFor(),
        CheckoutRequestID: checkoutRequestId,
    });

    const parsed = parseStkQuery(data);
    if (!parsed) {
        throw new Error(`M-Pesa status check failed: ${status} ${data?.errorMessage ?? ''}`.trim());
    }
    return { ...parsed, raw: data };
}
