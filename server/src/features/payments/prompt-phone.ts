/**
 * The phone side of an M-Pesa PIN prompt: which numbers can receive one, how they're shown back
 * to the customer, and how often an order may send one.
 */
import { readJsonColumn } from '../../lib/json-column';
import { normalisePhone } from '../../lib/phone';
import type { PaymentTransactionRow } from './payments.queries';

/** A prompt stays on the customer's phone for a minute or more; until then, don't send another. */
export const PROMPT_REUSE_MS = 60_000;
/** Prompts one order may send in total — stops a stolen checkout link being used to spam a phone. */
export const MAX_PROMPTS_PER_ORDER = 6;

/** A Kenyan mobile number M-Pesa can prompt, in 2547XXXXXXXX / 2541XXXXXXXX form. */
export function isMpesaNumber(phone: string): boolean {
    return /^254[17]\d{8}$/.test(phone);
}

/** A phone the customer typed, as an M-Pesa number, or null if M-Pesa can't prompt it. */
export function mpesaPhone(input: string | null | undefined): string | null {
    const phone = normalisePhone(String(input ?? ''));
    return isMpesaNumber(phone) ? phone : null;
}

/** 254712345678 → 0712 ••• 678, for telling the customer where the prompt went. */
export function maskPhone(phone: string): string {
    const local = phone.startsWith('254') ? `0${phone.slice(3)}` : phone;
    if (local.length < 7) return local;
    return `${local.slice(0, 4)} ••• ${local.slice(-3)}`;
}

/** Where an attempt's prompt went, masked for the payment screen. */
export function promptPhoneHint(tx: PaymentTransactionRow | undefined): string | null {
    const phone = readJsonColumn<{ phone?: string }>(tx?.raw_payload)?.phone;
    return phone ? maskPhone(phone) : null;
}
