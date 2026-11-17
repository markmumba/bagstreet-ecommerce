/**
 * M-Pesa payments for orders through Paystack: send the PIN prompt (Charge API), then learn how
 * it ended — from Paystack's signed `charge.success` webhook, or by asking (verify) when the
 * webhook is late, or the payment failed (Paystack only sends webhooks for successes).
 *
 * A webhook only triggers a verify; the order moves on what verify reports, so the webhook,
 * status polling and the expiry job all end in the same repeat-safe Order lifecycle events.
 */
import { ORDER_STATUS } from 'shared/dist';
import { chargeMpesa, verifyTransaction } from '../../services/paystack';
import { chargeReference, outcomeOfTransaction } from '../../services/paystack-protocol';
import { orderStateOf } from '../orders/lifecycle/order-lifecycle';
import { customerView } from '../orders/lifecycle/transitions';
import { ordersQueries } from '../orders/orders.queries';
import { applyAttemptOutcome } from './attempt-outcome';
import { paymentsQueries, type PaymentTransactionRow } from './payments.queries';

export const PAYSTACK = 'paystack' as const;

/** Status polling asks Paystack at most this often per attempt. */
const MIN_QUERY_INTERVAL_MS = 8_000;

const lastQueriedAt = new Map<number, number>();

/** Sends the PIN prompt for what's due on an order and records the attempt. Throws if Paystack refuses. */
export async function sendPaystackPrompt(
    order: { id: number; order_number?: string | null },
    amount: number,
    payer: { phone: string; email: string },
) {
    const orderNumber = order.order_number ?? `BS-${order.id}`;
    const charge = await chargeMpesa({
        reference: chargeReference(orderNumber),
        amount,
        phone: payer.phone,
        email: payer.email,
        metadata: { order_id: order.id, order_number: orderNumber },
    });
    return paymentsQueries.createProviderTransaction({
        order_id: order.id,
        provider: PAYSTACK,
        provider_reference: charge.reference,
        // One row per prompt: the order may need several (cancelled, wrong PIN, phone off).
        merchant_reference: charge.reference,
        amount: charge.amount,
        currency: 'KES',
        status: 'PENDING',
        raw_payload: { phone: payer.phone, charge: charge.raw },
    });
}

/** A verified `charge.success` webhook: check that charge now rather than waiting for polling. */
export async function recordPaystackWebhook(event: { event?: string; data?: { reference?: string } }) {
    const reference = event.data?.reference;
    if (!reference) return;
    const tx = await paymentsQueries.findProviderTransactionByReference(PAYSTACK, reference);
    if (!tx) {
        console.warn('[paystack] webhook for unknown reference:', reference);
        return;
    }
    await paymentsQueries.createProcessedPaymentEvent({
        provider: PAYSTACK,
        event_key: `webhook:${event.event ?? 'unknown'}:${reference}`,
        payment_transaction_id: tx.id,
        raw_payload: event,
    });
    await processPaystackTransaction(tx, { force: true });
}

/**
 * Asks Paystack how this attempt stands and applies it to the order. Safe to call repeatedly.
 * `force` skips the polling throttle (webhook and expiry job).
 */
export async function processPaystackTransaction(tx: PaymentTransactionRow, opts: { force?: boolean } = {}) {
    const settled = tx.status === 'COMPLETED' || tx.status === 'FAILED';
    const recentlyAsked = Date.now() - (lastQueriedAt.get(tx.id) ?? 0) < MIN_QUERY_INTERVAL_MS;
    let failureReason: string | null = settled && tx.status === 'FAILED' ? tx.result_desc : null;

    if (!settled && tx.provider_reference && (opts.force || !recentlyAsked)) {
        lastQueriedAt.set(tx.id, Date.now());
        const verified = await verifyTransaction(tx.provider_reference);
        // Unknown to Paystack yet (just sent) counts as pending.
        const ageMs = Date.now() - new Date(tx.created_at).getTime();
        const outcome = verified ? outcomeOfTransaction(verified.data, ageMs) : { state: 'pending' as const };
        if (!outcome) throw new Error(`Paystack verify for ${tx.provider_reference} returned something unexpected`);

        if (outcome.state !== 'pending') {
            failureReason = await applyAttemptOutcome(tx, outcome, {
                paymentMethod: 'M-Pesa (Paystack)',
                resultDesc: (verified?.data as any)?.gateway_response ?? null,
                raw: { verify: verified?.raw ?? null },
            });
            lastQueriedAt.delete(tx.id);
        }
    }

    const order = await ordersQueries.findById(tx.order_id);
    return {
        status: order ? customerView(orderStateOf(order as any)).status : ORDER_STATUS.PENDING,
        order_id: tx.order_id,
        receipt_number: tx.confirmation_code ?? undefined,
        payment_method: 'M-Pesa',
        failure_reason: failureReason,
    };
}
