/**
 * Releases stock held by online orders that were never paid.
 *
 * Stock is taken when an order is created (before payment) so two customers can't buy the last unit.
 * Without this job, every abandoned checkout would hold its stock forever.
 */
import { PAYMENT_STATUS } from 'shared/dist';
import { env } from '../config/env';
import { ordersQueries } from '../features/orders/orders.queries';
import { paymentsQueries } from '../features/payments/payments.queries';
import { MPESA, processMpesaTransaction } from '../features/payments/mpesa-payments';
import { applyOrderEvent } from '../features/orders/lifecycle/order-lifecycle';
import { shouldCancelExpiredOrder, type ProviderCheck } from './unpaid-order-policy';

const RUN_EVERY_MS = 5 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 30 * 1000;

/** Asks the provider about the order's latest payment attempt before giving up on it. */
async function checkProvider(orderId: number): Promise<ProviderCheck> {
    const tx = await paymentsQueries.findProviderTransactionByOrderId(orderId);
    if (!tx?.provider_reference) return 'none';
    try {
        // Attempts from a retired provider can't be checked any more: treat as unpaid.
        if (tx.provider !== MPESA) return 'not_paid';
        const result = await processMpesaTransaction(tx, { force: true });
        return result.status === PAYMENT_STATUS.PAID ? 'paid' : 'not_paid';
    } catch (err) {
        console.warn(`[order-expiry] could not check ${tx.provider} for order ${orderId}:`, err);
        return 'error';
    }
}

export async function expireUnpaidOrders(now: number = Date.now()): Promise<{ checked: number; cancelled: number }> {
    const ttlMs = env.UNPAID_ORDER_TTL_MINUTES * 60 * 1000;
    const candidates = await ordersQueries.findExpiredUnpaid(new Date(now - ttlMs));
    let cancelled = 0;

    for (const order of candidates) {
        const orderId = Number(order.id);
        const check = await checkProvider(orderId);
        const ageMs = now - new Date(order.created_at).getTime();
        if (!shouldCancelExpiredOrder(check, ageMs, ttlMs)) continue;

        // The lifecycle re-checks the state under a row lock: a payment confirmed a moment ago
        // (or held for review) makes this a no-op.
        try {
            const result = await applyOrderEvent(orderId, { type: 'expired' }, { kind: 'system' }, {
                auditMetadata: { reason: 'unpaid', ttl_minutes: env.UNPAID_ORDER_TTL_MINUTES, provider_check: check },
            });
            if (result.outcome === 'changed') cancelled += 1;
        } catch (err) {
            console.error(`[order-expiry] could not expire order ${orderId}:`, err);
        }
    }

    if (cancelled > 0) console.log(`[order-expiry] cancelled ${cancelled} unpaid order(s), stock released`);
    return { checked: candidates.length, cancelled };
}

export function startUnpaidOrderExpiry() {
    if (env.UNPAID_ORDER_TTL_MINUTES === 0) {
        console.log('[order-expiry] disabled (UNPAID_ORDER_TTL_MINUTES=0)');
        return;
    }

    let running = false;
    const run = async () => {
        if (running) return; // a slow provider check must not overlap the next tick
        running = true;
        try {
            await expireUnpaidOrders();
        } catch (err) {
            console.error('[order-expiry] run failed:', err);
        } finally {
            running = false;
        }
    };

    setTimeout(run, FIRST_RUN_DELAY_MS);
    setInterval(run, RUN_EVERY_MS);
    console.log(`[order-expiry] unpaid orders expire after ${env.UNPAID_ORDER_TTL_MINUTES} min`);
}
