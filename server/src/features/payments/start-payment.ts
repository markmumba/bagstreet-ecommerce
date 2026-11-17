import { alertStaff } from '../staff-alerts/staff-alerts';
import { PAYSTACK, sendPaystackPrompt } from './paystack-payments';
import { mpesaPhone } from './prompt-phone';
import { log } from '../../lib/log';

export interface StartedPayment {
    provider: typeof PAYSTACK;
    /** The attempt's Paystack reference, or null when no prompt went out (the payment screen lets them retry). */
    reference: string | null;
}

/**
 * Sends the M-Pesa PIN prompt (through Paystack) for an order that was just created. If Paystack
 * can't be reached the order still exists (the customer can retry from the payment screen) and
 * staff are told.
 */
export async function startOnlinePayment(
    order: { id: number; order_number?: string | null },
    amount: number,
    payer: { phone: string; email: string },
): Promise<StartedPayment> {
    const phone = mpesaPhone(payer.phone);
    // Not an M-Pesa line (e.g. a landline): the payment screen asks for one.
    if (!phone) return { provider: PAYSTACK, reference: null };
    try {
        const tx = await sendPaystackPrompt(order, amount, { phone, email: payer.email });
        return { provider: PAYSTACK, reference: tx.provider_reference };
    } catch (err) {
        log.error('paystack: M-Pesa prompt failed', { err, order_id: order.id });
        await notifyPaymentInitFailed(order, amount, err);
        return { provider: PAYSTACK, reference: null };
    }
}

/** Tells staff when an order was created but Paystack couldn't start the payment (e.g. it is down). */
async function notifyPaymentInitFailed(order: { id: number; order_number?: string | null }, amount: number, err: unknown) {
    try {
        await alertStaff({
            audience: 'money',
            type: 'PAYMENT_INIT_FAILED',
            title: `Payment could not start for ${order.order_number ?? `#${order.id}`}`,
            body: `KES ${amount.toFixed(2)} — Paystack error: ${err instanceof Error ? err.message : 'unknown'}. The customer can retry from checkout.`,
            link: '/orders',
            data: { order_id: String(order.id) },
            dedupeKey: `staff-alert:PAYMENT_INIT_FAILED:${order.id}`,
        });
    } catch (notifyErr) {
        log.error('payment init failure alert failed', { err: notifyErr, order_id: order.id });
    }
}
