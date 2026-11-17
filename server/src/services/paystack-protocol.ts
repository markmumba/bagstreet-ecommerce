/**
 * Paystack mobile money (M-Pesa) — pure message handling (no network, no env), unit-tested.
 * The HTTP side is in services/paystack.ts.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

/** What a Paystack charge came to, as far as Paystack can tell us right now. */
export type PaystackOutcome =
    | { state: 'pending' }
    | { state: 'paid'; amount: number; currency: string; receipt: string | null }
    | { state: 'failed'; reason: string };

/** The customer has 180 seconds to enter their PIN; give Paystack a little longer to say so. */
export const PROMPT_LIFETIME_MS = 4 * 60 * 1000;

/** KES 100 → 10000: Paystack amounts are in cents. M-Pesa only takes whole shillings. */
export function toSubunits(amount: number): number {
    return Math.max(1, Math.round(amount)) * 100;
}

/** 254712345678 → +254712345678, the form Paystack's docs ask for. */
export function paystackPhone(phone: string): string {
    return phone.startsWith('+') ? phone : `+${phone}`;
}

/**
 * A reference unique to one payment attempt: the order number plus a time suffix, since an order
 * may need several prompts. Paystack allows letters, digits, `-`, `.` and `=`.
 */
export function chargeReference(orderNumber: string, now: number = Date.now()): string {
    const base = orderNumber.replace(/[^A-Za-z0-9-]/g, '') || 'BS';
    return `${base}-${now.toString(36)}`;
}

/** Paystack's gateway text, made readable for the customer when we recognise it. */
export function failureReason(message: unknown): string {
    const text = typeof message === 'string' ? message.trim() : '';
    const lower = text.toLowerCase();
    if (lower.includes('cancel')) return 'The payment request was cancelled on your phone.';
    if (lower.includes('insufficient') || lower.includes('balance')) return 'Your M-Pesa balance was too low for this payment.';
    if (lower.includes('pin')) return 'The M-Pesa PIN entered was incorrect.';
    if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('expired')) {
        return 'The payment request expired before it was completed.';
    }
    if (lower.includes('unreachable') || lower.includes('not reachable')) {
        return "We couldn't reach your phone. Check it's on and has signal, then try again.";
    }
    return text || 'The M-Pesa payment was not completed.';
}

/**
 * A `GET /transaction/verify/:reference` response (or the `data` of a charge webhook).
 * `ageMs` is how long ago the prompt was sent: an "abandoned" charge only counts as failed once
 * the customer's 180 seconds are up. Returns null for something we don't understand.
 */
export function outcomeOfTransaction(data: unknown, ageMs: number): PaystackOutcome | null {
    const d = data as any;
    if (!d || typeof d !== 'object' || typeof d.status !== 'string') return null;

    switch (d.status) {
        case 'success': {
            const amount = Number(d.amount);
            if (!Number.isFinite(amount)) return null;
            const receipt = d.receipt_number ?? null;
            return {
                state: 'paid',
                amount: amount / 100,
                currency: String(d.currency ?? 'KES'),
                receipt: receipt == null || receipt === '' ? null : String(receipt),
            };
        }
        case 'failed':
        case 'reversed':
            return { state: 'failed', reason: failureReason(d.gateway_response ?? d.message) };
        case 'abandoned':
            return ageMs > PROMPT_LIFETIME_MS
                ? { state: 'failed', reason: 'The payment request expired before it was completed.' }
                : { state: 'pending' };
        default:
            // pending, ongoing, processing, queued, and anything new: not settled yet.
            return { state: 'pending' };
    }
}

function safeEqualHex(a: string, b: string): boolean {
    if (a.length !== b.length || !/^[0-9a-f]+$/i.test(a)) return false;
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

/** How far a signed webhook's timestamp may be from our clock. */
const SIGNATURE_TOLERANCE_SECONDS = 300;

/**
 * Checks a webhook really came from Paystack. Two schemes are accepted:
 * - `Paystack-Signature: t=<unix>,v1=<key id>:<hex>` — HMAC-SHA512 of `<t>.<raw body>` keyed with
 *   the webhook signing secret (whsec_…), rejected if `t` is more than 5 minutes off;
 * - legacy `x-paystack-signature: <hex>` — HMAC-SHA512 of the raw body keyed with the secret key.
 */
export function isValidWebhookSignature(input: {
    rawBody: string;
    signatureHeader?: string | null;
    legacySignatureHeader?: string | null;
    signingSecret?: string | null;
    secretKey?: string | null;
    nowSeconds?: number;
}): boolean {
    const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);

    if (input.signingSecret && input.signatureHeader) {
        const parts = input.signatureHeader.split(',').map((part) => part.trim());
        const t = parts.find((part) => part.startsWith('t='))?.slice(2);
        const signatures = parts
            .filter((part) => part.startsWith('v1='))
            .map((part) => part.slice(3).split(':').pop() ?? '');
        if (t && /^\d+$/.test(t) && Math.abs(now - Number(t)) <= SIGNATURE_TOLERANCE_SECONDS) {
            const expected = createHmac('sha512', input.signingSecret).update(`${t}.${input.rawBody}`).digest('hex');
            if (signatures.some((sig) => safeEqualHex(sig, expected))) return true;
        }
    }

    if (input.secretKey && input.legacySignatureHeader) {
        const expected = createHmac('sha512', input.secretKey).update(input.rawBody).digest('hex');
        if (safeEqualHex(input.legacySignatureHeader.trim(), expected)) return true;
    }

    return false;
}
