import { env } from '../../config/env';
import { submitPesapalOrder } from '../../services/pesapal';
import { alertStaff } from '../staff-alerts/staff-alerts';
import { paymentsQueries } from './payments.queries';

/** Who is paying, for Pesapal's billing details. */
export interface PayerContact {
    phone: string;
    email: string;
    fullName: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
}

/**
 * Starts the Pesapal payment for an order that was just created. If Pesapal can't be reached the
 * order still exists (the customer can retry from the payment screen) and staff are told.
 */
export async function startPesapalPayment(
    order: { id: number; order_number?: string | null },
    amount: number,
    payer: PayerContact,
): Promise<{ redirectUrl: string | null; reference: string | null }> {
    try {
        const payment = await submitPesapalOrder({ orderId: order.id, orderNumber: order.order_number, amount, ...payer });
        await paymentsQueries.createProviderTransaction({
            order_id: order.id,
            provider: 'pesapal',
            provider_reference: payment.orderTrackingId,
            merchant_reference: payment.merchantReference,
            checkout_url: payment.redirectUrl,
            amount,
            currency: env.PESAPAL_CURRENCY,
            status: payment.redirectUrl ? 'PENDING' : 'INITIATED',
            raw_payload: payment.raw,
        });
        return { redirectUrl: payment.redirectUrl, reference: payment.orderTrackingId };
    } catch (err) {
        console.error('[pesapal] payment initialization failed:', err);
        await notifyPaymentInitFailed(order, amount, err);
        return { redirectUrl: null, reference: null };
    }
}

/** Tells staff when an order was created but Pesapal couldn't start the payment (e.g. Pesapal is down). */
async function notifyPaymentInitFailed(order: { id: number; order_number?: string | null }, amount: number, err: unknown) {
    try {
        await alertStaff({
            audience: 'money',
            type: 'PAYMENT_INIT_FAILED',
            title: `Payment could not start for ${order.order_number ?? `#${order.id}`}`,
            body: `KES ${amount.toFixed(2)} — Pesapal error: ${err instanceof Error ? err.message : 'unknown'}. The customer can retry from checkout.`,
            link: '/orders',
            data: { order_id: String(order.id) },
            dedupeKey: `staff-alert:PAYMENT_INIT_FAILED:${order.id}`,
        });
    } catch (notifyErr) {
        console.error('[notifications] payment init failure alert failed:', notifyErr);
    }
}
