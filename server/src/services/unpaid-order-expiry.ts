/**
 * Releases stock held by online orders that were never paid.
 *
 * Stock is taken when an order is created (before payment) so two customers can't buy the last unit.
 * Without this job, every abandoned Pesapal checkout would hold its stock forever.
 */
import { PAYMENT_STATUS } from 'shared/dist';
import { env } from '../config/env';
import { createAuditLog } from '../lib/audit';
import { ordersQueries } from '../features/orders/orders.queries';
import { paymentsQueries } from '../features/payments/payments.queries';
import { processPesapalTransaction } from '../features/payments/payments.handlers';
import { shouldCancelExpiredOrder, type PesapalCheck } from './unpaid-order-policy';

const RUN_EVERY_MS = 5 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 30 * 1000;

async function checkPesapal(orderId: number): Promise<PesapalCheck> {
    const tx = await paymentsQueries.findProviderTransactionByOrderId(orderId, 'pesapal');
    if (!tx?.provider_reference) return 'none';
    try {
        const result = await processPesapalTransaction(tx);
        return result.status === PAYMENT_STATUS.PAID ? 'paid' : 'not_paid';
    } catch (err) {
        console.warn(`[order-expiry] could not check Pesapal for order ${orderId}:`, err);
        return 'error';
    }
}

export async function expireUnpaidOrders(now: number = Date.now()): Promise<{ checked: number; cancelled: number }> {
    const ttlMs = env.UNPAID_ORDER_TTL_MINUTES * 60 * 1000;
    const candidates = await ordersQueries.findExpiredUnpaid(new Date(now - ttlMs));
    let cancelled = 0;

    for (const order of candidates) {
        const orderId = Number(order.id);
        const check = await checkPesapal(orderId);
        const ageMs = now - new Date(order.created_at).getTime();
        if (!shouldCancelExpiredOrder(check, ageMs, ttlMs)) continue;

        // Conditional cancel: a payment confirmed a moment ago makes this a no-op.
        if (await ordersQueries.cancelUnpaid(orderId)) {
            cancelled += 1;
            await createAuditLog({
                action: 'ORDER_EXPIRED',
                entityType: 'order',
                entityId: orderId,
                after: { status: 'CANCELLED' },
                metadata: { reason: 'unpaid', ttl_minutes: env.UNPAID_ORDER_TTL_MINUTES, pesapal_check: check },
            }).catch((err) => console.error('[order-expiry] audit log failed:', err));
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
        if (running) return; // a slow Pesapal check must not overlap the next tick
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
