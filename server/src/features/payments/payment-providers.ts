/**
 * The M-Pesa prompt providers. PAYMENT_PROVIDER picks who sends new prompts; an existing attempt
 * is always checked with the provider that made it, so switching never strands a payment.
 */
import { env } from '../../config/env';
import { MPESA, processMpesaTransaction, sendMpesaPrompt } from './mpesa-payments';
import { PAYSTACK, processPaystackTransaction, sendPaystackPrompt } from './paystack-payments';
import type { PaymentTransactionRow } from './payments.queries';

export type ProviderName = typeof MPESA | typeof PAYSTACK;

interface PromptProvider {
    name: ProviderName;
    /** Sends the PIN prompt to `payer.phone` (2547… form) and records the attempt. Throws if refused. */
    send(order: { id: number; order_number?: string | null }, amount: number, payer: { phone: string; email: string }): Promise<PaymentTransactionRow>;
    /** Asks the provider how an attempt stands and applies it to the order. */
    check(tx: PaymentTransactionRow, opts?: { force?: boolean }): Promise<{
        status: string;
        order_id: number;
        failure_reason: string | null;
    }>;
}

const PROVIDERS: Record<ProviderName, PromptProvider> = {
    [MPESA]: {
        name: MPESA,
        send: (order, amount, payer) => sendMpesaPrompt(order, amount, payer.phone),
        check: processMpesaTransaction,
    },
    [PAYSTACK]: {
        name: PAYSTACK,
        send: sendPaystackPrompt,
        check: processPaystackTransaction,
    },
};

/** The provider new prompts go through. */
export function activeProvider(): PromptProvider {
    return PROVIDERS[env.PAYMENT_PROVIDER];
}

/** The provider that made an attempt, or null for one we can no longer check (e.g. retired Pesapal). */
export function providerOf(tx: PaymentTransactionRow): PromptProvider | null {
    return PROVIDERS[tx.provider as ProviderName] ?? null;
}
