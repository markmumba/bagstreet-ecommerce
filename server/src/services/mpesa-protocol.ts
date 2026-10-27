/**
 * Safaricom Daraja M-Pesa Express (STK Push) — pure message handling (no network, no env), unit-tested.
 * The HTTP side is in services/mpesa.ts.
 */

/** What an STK Push attempt came to, as far as Safaricom can tell us right now. */
export type StkOutcome =
    | { state: 'paid' }
    | { state: 'failed'; resultCode: string; reason: string }
    | { state: 'pending' };

/** Daraja error code for "the customer hasn't finished yet" when querying a payment. */
const STILL_PROCESSING = '500.001.1001';
/** Query ResultCode for the same thing; can come back even after the "paid" callback has arrived. */
const STILL_PROCESSING_RESULT = '4999';

/** Customer-facing reasons for the common STK result codes; anything else gets the generic one. */
const FAILURE_REASONS: Record<string, string> = {
    '1': 'Your M-Pesa balance was too low for this payment.',
    '1001': 'M-Pesa was busy with another transaction on your line. Please try again.',
    '1019': 'The payment request expired before it was completed.',
    '1025': 'M-Pesa could not send the payment request. Please try again.',
    '1032': 'The payment request was cancelled on your phone.',
    '1037': "We couldn't reach your phone. Check it's on and has signal, then try again.",
    '2001': 'The M-Pesa PIN entered was incorrect.',
};

export function failureReason(resultCode: string, resultDesc?: string | null): string {
    return FAILURE_REASONS[resultCode] ?? resultDesc ?? 'The M-Pesa payment was not completed.';
}

/** A ResultCode from a callback or a query. Safaricom sends it as a number or a string. */
export function outcomeOf(resultCode: unknown, resultDesc?: unknown): StkOutcome {
    const code = String(resultCode ?? '').trim();
    if (code === '') return { state: 'pending' };
    if (code === '0') return { state: 'paid' };
    if (code === STILL_PROCESSING_RESULT) return { state: 'pending' };
    const desc = resultDesc == null ? null : String(resultDesc);
    return { state: 'failed', resultCode: code, reason: failureReason(code, desc) };
}

/** YYYYMMDDHHmmss in Kenyan time (EAT, UTC+3 all year), as Daraja expects. */
export function darajaTimestamp(now: Date = new Date()): string {
    const eat = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${eat.getUTCFullYear()}${pad(eat.getUTCMonth() + 1)}${pad(eat.getUTCDate())}`
        + `${pad(eat.getUTCHours())}${pad(eat.getUTCMinutes())}${pad(eat.getUTCSeconds())}`;
}

export function stkPassword(shortcode: string, passkey: string, timestamp: string): string {
    return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
}

/**
 * M-Pesa only takes whole shillings. Rounding to the nearest keeps the charge within the
 * ±0.5 the payment check allows, so a cents total isn't flagged as under- or overpaid.
 */
export function stkAmount(amount: number): number {
    return Math.max(1, Math.round(amount));
}

/** A Kenyan mobile number M-Pesa can prompt, in 2547XXXXXXXX / 2541XXXXXXXX form. */
export function isMpesaNumber(phone: string): boolean {
    return /^254[17]\d{8}$/.test(phone);
}

/** 254712345678 → 0712 ••• 678, for telling the customer where the prompt went. */
export function maskPhone(phone: string): string {
    const local = phone.startsWith('254') ? `0${phone.slice(3)}` : phone;
    if (local.length < 7) return local;
    return `${local.slice(0, 4)} ••• ${local.slice(-3)}`;
}

/** AccountReference shows on the customer's prompt and statement; Daraja allows 12 characters. */
export function accountReference(orderNumber: string): string {
    return orderNumber.replace(/[^A-Za-z0-9-]/g, '').slice(0, 12) || 'BAGSTREET';
}

export interface StkCallback {
    merchantRequestId: string;
    checkoutRequestId: string;
    outcome: StkOutcome;
    resultDesc: string | null;
    amount: number | null;
    receipt: string | null;
    phone: string | null;
}

/** The body Safaricom posts to the callback URL, or null if it isn't one. */
export function parseStkCallback(body: unknown): StkCallback | null {
    const cb = (body as any)?.Body?.stkCallback;
    if (!cb || typeof cb.CheckoutRequestID !== 'string' || cb.CheckoutRequestID === '') return null;

    const items: { Name?: string; Value?: unknown }[] = Array.isArray(cb.CallbackMetadata?.Item) ? cb.CallbackMetadata.Item : [];
    const item = (name: string) => items.find((i) => i?.Name === name)?.Value;
    const amount = Number(item('Amount'));
    const receipt = item('MpesaReceiptNumber');
    const phone = item('PhoneNumber');

    return {
        merchantRequestId: String(cb.MerchantRequestID ?? ''),
        checkoutRequestId: cb.CheckoutRequestID,
        outcome: outcomeOf(cb.ResultCode, cb.ResultDesc),
        resultDesc: cb.ResultDesc == null ? null : String(cb.ResultDesc),
        amount: Number.isFinite(amount) && amount > 0 ? amount : null,
        receipt: receipt == null || receipt === '' ? null : String(receipt),
        phone: phone == null ? null : String(phone),
    };
}

/**
 * An STK Push Query response. While the customer is still on the PIN screen Daraja answers with
 * an error ("being processed") rather than a result, so that counts as pending, not a failure.
 * Returns null when the response isn't something we understand (treat as an error).
 */
export function parseStkQuery(data: unknown): { outcome: StkOutcome; resultDesc: string | null } | null {
    const d = data as any;
    if (!d || typeof d !== 'object') return null;
    if (d.errorCode === STILL_PROCESSING) return { outcome: { state: 'pending' }, resultDesc: d.errorMessage ?? null };
    if (d.ResultCode === undefined || d.ResultCode === null) return null;
    return { outcome: outcomeOf(d.ResultCode, d.ResultDesc), resultDesc: d.ResultDesc == null ? null : String(d.ResultDesc) };
}
