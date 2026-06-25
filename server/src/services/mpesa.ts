import { env } from '../config/env';

const BASE_URL =
    env.MPESA_ENV === 'production'
        ? 'https://api.safaricom.co.ke'
        : 'https://sandbox.safaricom.co.ke';

// In-memory OAuth token cache (55-min TTL)
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(): Promise<string> {
    if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

    const key = env.MPESA_CONSUMER_KEY!;
    const secret = env.MPESA_CONSUMER_SECRET!;
    const credentials = Buffer.from(`${key}:${secret}`).toString('base64');

    const res = await fetch(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
        headers: { Authorization: `Basic ${credentials}` },
    });

    if (!res.ok) throw new Error(`M-Pesa OAuth failed: ${res.status}`);
    const data = (await res.json()) as { access_token: string; expires_in: string };

    cachedToken = data.access_token;
    tokenExpiresAt = Date.now() + 55 * 60 * 1000; // 55 minutes
    return cachedToken;
}

// Normalise phone: 07XX → 2547XX, +254... → 254..., 254... stays
function normalisePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('0')) return '254' + digits.slice(1);
    if (digits.startsWith('254')) return digits;
    return digits;
}

function buildPassword(): { password: string; timestamp: string } {
    const shortcode = env.MPESA_SHORTCODE!;
    const passkey = env.MPESA_PASSKEY!;
    const timestamp = new Date()
        .toISOString()
        .replace(/[-T:.Z]/g, '')
        .slice(0, 14);
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
    return { password, timestamp };
}

export async function stkPush(params: {
    phone: string;
    amount: number;
    orderId: number;
}): Promise<{ checkoutRequestId: string; merchantRequestId: string }> {
    if (!env.MPESA_CONSUMER_KEY) {
        // Dev fallback: log and return mock IDs
        const mockCheckout = `mock-checkout-${params.orderId}-${Date.now()}`;
        const mockMerchant = `mock-merchant-${params.orderId}-${Date.now()}`;
        console.log('[DEV] STK Push skipped — no M-Pesa credentials');
        console.log(`[DEV]  Order: ${params.orderId} | Phone: ${params.phone} | Amount: KES ${params.amount}`);
        console.log(`[DEV]  CheckoutRequestID: ${mockCheckout}`);
        return { checkoutRequestId: mockCheckout, merchantRequestId: mockMerchant };
    }

    const token = await getAccessToken();
    const { password, timestamp } = buildPassword();
    const phone = normalisePhone(params.phone);
    const amount = Math.ceil(params.amount); // M-Pesa only accepts integers

    const body = {
        BusinessShortCode: env.MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: amount,
        PartyA: phone,
        PartyB: env.MPESA_SHORTCODE,
        PhoneNumber: phone,
        CallBackURL: env.MPESA_CALLBACK_URL,
        AccountReference: `Order-${params.orderId}`,
        TransactionDesc: `Payment for Bagstreet Order #${params.orderId}`,
    };

    const res = await fetch(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`STK Push failed: ${res.status} — ${err}`);
    }

    const data = (await res.json()) as {
        CheckoutRequestID: string;
        MerchantRequestID: string;
        ResponseCode: string;
        ResponseDescription: string;
    };

    if (data.ResponseCode !== '0') {
        throw new Error(`STK Push rejected: ${data.ResponseDescription}`);
    }

    return {
        checkoutRequestId: data.CheckoutRequestID,
        merchantRequestId: data.MerchantRequestID,
    };
}

export function parseCallback(body: any): {
    success: boolean;
    checkoutRequestId: string;
    resultCode: number;
    resultDesc: string;
    receiptNumber?: string;
} {
    const stk = body?.Body?.stkCallback;
    if (!stk) throw new Error('Invalid M-Pesa callback body');

    const resultCode: number = stk.ResultCode;
    const resultDesc: string = stk.ResultDesc;
    const checkoutRequestId: string = stk.CheckoutRequestID;

    let receiptNumber: string | undefined;
    if (resultCode === 0) {
        const items: any[] = stk.CallbackMetadata?.Item ?? [];
        const receipt = items.find((i: any) => i.Name === 'MpesaReceiptNumber');
        receiptNumber = receipt?.Value;
    }

    return { success: resultCode === 0, checkoutRequestId, resultCode, resultDesc, receiptNumber };
}
