/**
 * M-Pesa Express payments for orders: send the PIN prompt, then learn how it ended — from
 * Safaricom's callback, or by asking (STK Push Query) when the callback is late or lost.
 *
 * Callbacks aren't signed, so a callback alone never moves an order: it is stored on the attempt
 * and then confirmed with a query. Every path ends in the same Order lifecycle events, which
 * ignore repeats, so the callback, status polling and the expiry job can all run in any order.
 */
import { ORDER_STATUS } from 'shared/dist';
import { readJsonColumn } from '../../lib/json-column';
import { normalisePhone } from '../../lib/phone';
import { queryStkPush, sendStkPush } from '../../services/mpesa';
import { isMpesaNumber, maskPhone, type StkCallback, type StkOutcome } from '../../services/mpesa-protocol';
import { orderStateOf } from '../orders/lifecycle/order-lifecycle';
import { customerView } from '../orders/lifecycle/transitions';
import { applyAttemptOutcome, type AttemptOutcome } from './attempt-outcome';
import { ordersQueries } from '../orders/orders.queries';
import { paymentsQueries, type PaymentTransactionRow } from './payments.queries';

export const MPESA = 'mpesa';
const CURRENCY = 'KES';

/** A prompt stays on the customer's phone for about a minute; until then, don't send another. */
export const PROMPT_REUSE_MS = 60_000;
/** Prompts one order may send in total — stops a stolen checkout link being used to spam a phone. */
export const MAX_PROMPTS_PER_ORDER = 6;
/** Status polling asks Safaricom at most this often per attempt. */
const MIN_QUERY_INTERVAL_MS = 8_000;

const lastQueriedAt = new Map<number, number>();

/** A phone the customer typed, as an M-Pesa number, or null if M-Pesa can't prompt it. */
export function mpesaPhone(input: string | null | undefined): string | null {
    const phone = normalisePhone(String(input ?? ''));
    return isMpesaNumber(phone) ? phone : null;
}

/** Where the attempt's prompt went, masked for the payment screen. */
export function promptPhoneHint(tx: PaymentTransactionRow | undefined): string | null {
    const phone = readJsonColumn<{ phone?: string }>(tx?.raw_payload)?.phone;
    return phone ? maskPhone(phone) : null;
}

/** Sends the PIN prompt for what's due on an order and records the attempt. Throws if Safaricom refuses. */
export async function sendMpesaPrompt(order: { id: number; order_number?: string | null }, amount: number, phone: string) {
    const orderNumber = order.order_number ?? `BS-${order.id}`;
    const push = await sendStkPush({ orderNumber, amount, phone });
    return paymentsQueries.createProviderTransaction({
        order_id: order.id,
        provider: MPESA,
        provider_reference: push.checkoutRequestId,
        // One row per prompt: the order may need several (cancelled, wrong PIN, phone off).
        merchant_reference: `${orderNumber}:${push.checkoutRequestId}`,
        amount: push.amount,
        currency: CURRENCY,
        status: 'PENDING',
        raw_payload: { phone, push: push.raw },
    });
}

/** Stores what the callback said on its attempt, then confirms it with Safaricom. */
export async function recordMpesaCallback(callback: StkCallback) {
    const tx = await paymentsQueries.findProviderTransactionByReference(MPESA, callback.checkoutRequestId);
    if (!tx) {
        console.warn('[mpesa] callback for unknown CheckoutRequestID:', callback.checkoutRequestId);
        return;
    }

    await paymentsQueries.createProcessedPaymentEvent({
        provider: MPESA,
        event_key: `callback:${callback.checkoutRequestId}:${callback.outcome.state}`,
        payment_transaction_id: tx.id,
        raw_payload: callback,
    });
    const updated: PaymentTransactionRow = {
        ...tx,
        confirmation_code: callback.receipt ?? tx.confirmation_code,
        result_desc: callback.resultDesc ?? tx.result_desc,
        raw_payload: { ...(readJsonColumn(tx.raw_payload) ?? {}), callback },
    };
    await paymentsQueries.updateProviderTransaction(tx.id, {
        status: tx.status,
        payment_method: 'M-Pesa',
        confirmation_code: updated.confirmation_code,
        result_desc: updated.result_desc,
        raw_payload: updated.raw_payload,
    });

    await processMpesaTransaction(updated, { force: true });
}

/** The query's verdict. STK Push charges exactly what was asked, so a payment needs no amount. */
function attemptOutcome(outcome: StkOutcome): AttemptOutcome {
    return outcome.state === 'failed' ? { state: 'failed', reason: outcome.reason } : outcome;
}

/**
 * Asks Safaricom how this attempt ended and applies it to the order. Safe to call repeatedly.
 * `force` skips the polling throttle (callback and expiry job).
 */
export async function processMpesaTransaction(tx: PaymentTransactionRow, opts: { force?: boolean } = {}) {
    const settled = tx.status === 'COMPLETED' || tx.status === 'FAILED';
    const recentlyAsked = Date.now() - (lastQueriedAt.get(tx.id) ?? 0) < MIN_QUERY_INTERVAL_MS;
    let failureReason: string | null = settled && tx.status === 'FAILED' ? tx.result_desc : null;

    if (!settled && tx.provider_reference && (opts.force || !recentlyAsked)) {
        lastQueriedAt.set(tx.id, Date.now());
        const result = await queryStkPush(tx.provider_reference);
        if (result.outcome.state !== 'pending') {
            failureReason = await applyAttemptOutcome(tx, attemptOutcome(result.outcome), {
                paymentMethod: 'M-Pesa',
                resultDesc: result.resultDesc,
                raw: { query: result.raw },
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
