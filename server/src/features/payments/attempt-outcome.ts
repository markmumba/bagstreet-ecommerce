/**
 * The step every payment provider shares: once the provider has said how a payment attempt
 * ended, apply that to the order (through the Order lifecycle) and record it on the attempt.
 *
 * Repeat-safe: the lifecycle ignores a capture it has already recorded, so a webhook, status
 * polling and the expiry job can all report the same outcome.
 */
import { applyOrderEvent } from '../orders/lifecycle/order-lifecycle';
import type { OrderEvent } from '../orders/lifecycle/transitions';
import { readJsonColumn } from '../../lib/json-column';
import { paymentsQueries, type PaymentTransactionRow } from './payments.queries';

/** How a payment attempt stands, as reported by its provider. */
export type AttemptOutcome =
    | { state: 'pending' }
    /** `amount`/`currency` as the provider reports them; unset means exactly what was asked. */
    | { state: 'paid'; amount?: number; currency?: string; receipt?: string | null }
    | { state: 'failed'; reason: string };

function orderEventFor(tx: PaymentTransactionRow, outcome: AttemptOutcome): OrderEvent | null {
    switch (outcome.state) {
        case 'paid':
            return {
                type: 'payment_captured',
                amount: outcome.amount ?? parseFloat(tx.amount),
                currency: outcome.currency ?? tx.currency,
                // Named after the attempt, never a receipt: every path must name the capture the
                // same way for repeats to be ignored, and not every path sees the receipt.
                reference: `${tx.provider}:${tx.provider_reference}`,
                transactionId: tx.id,
            };
        case 'failed':
            return { type: 'payment_failed', attemptReference: `${tx.provider}:${tx.provider_reference}`, reason: outcome.reason };
        default:
            return null;
    }
}

/**
 * Applies a settled outcome to the order, then marks the attempt COMPLETED or FAILED.
 * Returns the failure reason, if any. Does nothing for a pending outcome.
 */
export async function applyAttemptOutcome(
    tx: PaymentTransactionRow,
    outcome: AttemptOutcome,
    details: { paymentMethod: string; resultDesc?: string | null; raw?: Record<string, unknown> },
): Promise<string | null> {
    const event = orderEventFor(tx, outcome);
    if (!event) return null;

    // An older attempt failing (e.g. a late "cancelled") mustn't mark the order failed while a
    // newer attempt is still waiting on the customer. A capture always counts.
    const latest = await paymentsQueries.findProviderTransactionByOrderId(tx.order_id);
    const applies = event.type === 'payment_captured' || latest?.id === tx.id;
    const receipt = outcome.state === 'paid' ? outcome.receipt ?? tx.confirmation_code : tx.confirmation_code;

    // The order first, then the attempt: if this stops in between, the attempt still looks
    // pending and the next check applies the (repeat-safe) event again.
    if (applies) {
        await applyOrderEvent(tx.order_id, event, { kind: 'payment_provider' }, {
            paymentMetadata: {
                provider: tx.provider,
                provider_reference: tx.provider_reference,
                merchant_reference: tx.merchant_reference,
                payment_method: details.paymentMethod,
                receipt,
            },
        });
    }

    const failureReason = outcome.state === 'failed' ? outcome.reason : null;
    await paymentsQueries.updateProviderTransaction(tx.id, {
        status: outcome.state === 'paid' ? 'COMPLETED' : 'FAILED',
        payment_method: details.paymentMethod,
        confirmation_code: receipt,
        result_desc: failureReason ?? details.resultDesc ?? null,
        raw_payload: { ...(readJsonColumn(tx.raw_payload) ?? {}), ...details.raw },
    });
    return failureReason;
}
