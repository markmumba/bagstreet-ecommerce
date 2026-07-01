import { env } from '../config/env';
import { Bulkhead, CircuitBreaker, fetchWithTimeout } from '../lib/resilience';
import { normalisePhone } from '../lib/phone';

const BASE_URL = env.PESAPAL_ENV === 'production'
    ? 'https://pay.pesapal.com/v3'
    : 'https://cybqa.pesapal.com/pesapalv3';

const PROVIDER = 'pesapal';

export const pesapalCircuit = new CircuitBreaker({
    name: PROVIDER,
    failureThreshold: 5,
    resetTimeoutMs: 30_000,
    halfOpenMaxCalls: 2,
});

export const pesapalBulkhead = new Bulkhead(PROVIDER, 10);

type PesapalTokenResponse = {
    token?: string;
    expiryDate?: string;
    status?: string;
    message?: string;
    error?: unknown;
};

type SubmitOrderResponse = {
    order_tracking_id?: string;
    merchant_reference?: string;
    redirect_url?: string;
    status?: string;
    message?: string;
    error?: unknown;
};

export type PesapalTransactionStatus = {
    payment_method?: string;
    amount?: number;
    confirmation_code?: string;
    payment_status_description?: 'INVALID' | 'FAILED' | 'COMPLETED' | 'REVERSED' | string;
    description?: string;
    payment_account?: string;
    status_code?: number;
    merchant_reference?: string;
    currency?: string;
    raw: unknown;
};

export function isPesapalConfigured() {
    return Boolean(env.PESAPAL_CONSUMER_KEY && env.PESAPAL_CONSUMER_SECRET && env.PESAPAL_IPN_ID);
}

function callbackUrl() {
    return env.PESAPAL_CALLBACK_URL ?? `${env.SERVER_URL}/api/payments/pesapal/callback`;
}

function cancellationUrl() {
    return env.PESAPAL_CANCELLATION_URL ?? `${env.STOREFRONT_URL}/checkout`;
}

async function requestToken(): Promise<string> {
    if (!env.PESAPAL_CONSUMER_KEY || !env.PESAPAL_CONSUMER_SECRET) {
        throw new Error('Pesapal credentials are not configured');
    }

    const res = await pesapalBulkhead.execute(() =>
        pesapalCircuit.execute(() =>
            fetchWithTimeout(
                `${BASE_URL}/api/Auth/RequestToken`,
                {
                    method: 'POST',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        consumer_key: env.PESAPAL_CONSUMER_KEY,
                        consumer_secret: env.PESAPAL_CONSUMER_SECRET,
                    }),
                },
                env.PESAPAL_TIMEOUT_MS,
            )
        )
    );

    const data = await res.json() as PesapalTokenResponse;
    if (!res.ok || !data.token) {
        throw new Error(`Pesapal authentication failed: ${res.status} ${data.message ?? ''}`.trim());
    }

    return data.token;
}

function splitName(fullName: string) {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    const firstName = parts.shift() ?? 'Customer';
    const lastName = parts.join(' ');
    return { firstName, lastName };
}

export async function submitPesapalOrder(params: {
    orderId: number;
    orderNumber?: string | null;
    amount: number;
    phone: string;
    email: string;
    fullName: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
}) {
    const merchantReference = params.orderNumber ?? `BS-${params.orderId}`;

    if (!isPesapalConfigured()) {
        if (env.NODE_ENV === 'production') {
            throw new Error('Pesapal is not configured');
        }
        console.log(`[DEV] Pesapal submit skipped for order ${params.orderId}`);
        return {
            orderTrackingId: `mock-pesapal-${merchantReference}`,
            merchantReference,
            redirectUrl: null as string | null,
            raw: null,
        };
    }

    const token = await requestToken();
    const { firstName, lastName } = splitName(params.fullName);

    const payload = {
        id: merchantReference,
        currency: env.PESAPAL_CURRENCY,
        amount: Number(params.amount.toFixed(2)),
        description: `Bagstreet Order ${merchantReference}`,
        callback_url: callbackUrl(),
        cancellation_url: cancellationUrl(),
        notification_id: env.PESAPAL_IPN_ID,
        billing_address: {
            email_address: params.email,
            phone_number: normalisePhone(params.phone),
            country_code: 'KE',
            first_name: firstName,
            last_name: lastName,
            line_1: params.addressLine1 ?? '',
            line_2: params.addressLine2 ?? '',
            city: params.city ?? '',
            state: (params.state ?? '').slice(0, 3),
            postal_code: '',
            zip_code: '',
        },
    };

    const res = await pesapalBulkhead.execute(() =>
        pesapalCircuit.execute(() =>
            fetchWithTimeout(
                `${BASE_URL}/api/Transactions/SubmitOrderRequest`,
                {
                    method: 'POST',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify(payload),
                },
                env.PESAPAL_TIMEOUT_MS,
            )
        )
    );

    const data = await res.json() as SubmitOrderResponse;
    if (!res.ok || !data.order_tracking_id) {
        throw new Error(`Pesapal order submit failed: ${res.status} ${data.message ?? ''}`.trim());
    }

    return {
        orderTrackingId: data.order_tracking_id,
        merchantReference: data.merchant_reference ?? merchantReference,
        redirectUrl: data.redirect_url ?? null,
        raw: data,
    };
}

export async function getPesapalTransactionStatus(orderTrackingId: string): Promise<PesapalTransactionStatus> {
    if (orderTrackingId.startsWith('mock-pesapal-')) {
        return {
            payment_status_description: 'PENDING',
            merchant_reference: orderTrackingId.replace('mock-pesapal-', 'BS-'),
            raw: null,
        };
    }

    const token = await requestToken();
    const url = new URL(`${BASE_URL}/api/Transactions/GetTransactionStatus`);
    url.searchParams.set('orderTrackingId', orderTrackingId);

    const res = await pesapalBulkhead.execute(() =>
        pesapalCircuit.execute(() =>
            fetchWithTimeout(
                url,
                {
                    method: 'GET',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                },
                env.PESAPAL_TIMEOUT_MS,
            )
        )
    );

    const data = await res.json() as any;
    if (!res.ok) {
        throw new Error(`Pesapal status check failed: ${res.status} ${data?.message ?? ''}`.trim());
    }

    return {
        payment_method: data.payment_method,
        amount: Number(data.amount ?? 0),
        confirmation_code: data.confirmation_code,
        payment_status_description: data.payment_status_description?.toUpperCase?.() ?? data.payment_status_description,
        description: data.description,
        payment_account: data.payment_account,
        status_code: Number(data.status_code ?? 0),
        merchant_reference: data.merchant_reference,
        currency: data.currency,
        raw: data,
    };
}
