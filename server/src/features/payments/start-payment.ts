import { alertStaff } from '../staff-alerts/staff-alerts';
import { MPESA, mpesaPhone, sendMpesaPrompt } from './mpesa-payments';

export interface StartedPayment {
    provider: typeof MPESA;
    /** The STK Push reference, or null when no prompt went out (the payment screen lets them retry). */
    reference: string | null;
}

/**
 * Sends the M-Pesa PIN prompt for an order that was just created. If M-Pesa can't be reached the
 * order still exists (the customer can retry from the payment screen) and staff are told.
 */
export async function startOnlinePayment(
    order: { id: number; order_number?: string | null },
    amount: number,
    payerPhone: string,
): Promise<StartedPayment> {
    const phone = mpesaPhone(payerPhone);
    // Not an M-Pesa line (e.g. a landline): the payment screen asks for one.
    if (!phone) return { provider: MPESA, reference: null };
    try {
        const tx = await sendMpesaPrompt(order, amount, phone);
        return { provider: MPESA, reference: tx.provider_reference };
    } catch (err) {
        console.error('[mpesa] STK push failed:', err);
        await notifyPaymentInitFailed(order, amount, err);
        return { provider: MPESA, reference: null };
    }
}

/** Tells staff when an order was created but M-Pesa couldn't start the payment (e.g. it is down). */
async function notifyPaymentInitFailed(order: { id: number; order_number?: string | null }, amount: number, err: unknown) {
    try {
        await alertStaff({
            audience: 'money',
            type: 'PAYMENT_INIT_FAILED',
            title: `Payment could not start for ${order.order_number ?? `#${order.id}`}`,
            body: `KES ${amount.toFixed(2)} — M-Pesa error: ${err instanceof Error ? err.message : 'unknown'}. The customer can retry from checkout.`,
            link: '/orders',
            data: { order_id: String(order.id) },
            dedupeKey: `staff-alert:PAYMENT_INIT_FAILED:${order.id}`,
        });
    } catch (notifyErr) {
        console.error('[notifications] payment init failure alert failed:', notifyErr);
    }
}
