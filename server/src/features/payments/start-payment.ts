import { env } from '../../config/env';
import { submitPesapalOrder } from '../../services/pesapal';
import { alertStaff } from '../staff-alerts/staff-alerts';
import { paymentsQueries } from './payments.queries';
import { mpesaPhone, sendMpesaPrompt } from './mpesa-payments';

/** Who is paying, for the provider (Pesapal wants billing details; M-Pesa only the phone). */
export interface PayerContact {
    phone: string;
    email: string;
    fullName: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
}

export interface StartedPayment {
    provider: typeof env.PAYMENT_PROVIDER;
    /** Pesapal: its hosted payment page. M-Pesa: none, the prompt goes to the phone. */
    redirectUrl: string | null;
    reference: string | null;
}

/**
 * Starts the online payment for an order that was just created, with whichever provider is
 * switched on (PAYMENT_PROVIDER). If the provider can't be reached the order still exists (the
 * customer can retry from the payment screen) and staff are told.
 */
export async function startOnlinePayment(
    order: { id: number; order_number?: string | null },
    amount: number,
    payer: PayerContact,
): Promise<StartedPayment> {
    return env.PAYMENT_PROVIDER === 'mpesa'
        ? startMpesaPayment(order, amount, payer)
        : startPesapalPayment(order, amount, payer);
}

async function startMpesaPayment(order: { id: number; order_number?: string | null }, amount: number, payer: PayerContact): Promise<StartedPayment> {
    const phone = mpesaPhone(payer.phone);
    // Not an M-Pesa line (e.g. a landline): the payment screen asks for one.
    if (!phone) return { provider: 'mpesa', redirectUrl: null, reference: null };
    try {
        const tx = await sendMpesaPrompt(order, amount, phone);
        return { provider: 'mpesa', redirectUrl: null, reference: tx.provider_reference };
    } catch (err) {
        console.error('[mpesa] STK push failed:', err);
        await notifyPaymentInitFailed(order, amount, 'M-Pesa', err);
        return { provider: 'mpesa', redirectUrl: null, reference: null };
    }
}

async function startPesapalPayment(order: { id: number; order_number?: string | null }, amount: number, payer: PayerContact): Promise<StartedPayment> {
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
        return { provider: 'pesapal', redirectUrl: payment.redirectUrl, reference: payment.orderTrackingId };
    } catch (err) {
        console.error('[pesapal] payment initialization failed:', err);
        await notifyPaymentInitFailed(order, amount, 'Pesapal', err);
        return { provider: 'pesapal', redirectUrl: null, reference: null };
    }
}

/** Tells staff when an order was created but the provider couldn't start the payment (e.g. it is down). */
async function notifyPaymentInitFailed(order: { id: number; order_number?: string | null }, amount: number, providerName: string, err: unknown) {
    try {
        await alertStaff({
            audience: 'money',
            type: 'PAYMENT_INIT_FAILED',
            title: `Payment could not start for ${order.order_number ?? `#${order.id}`}`,
            body: `KES ${amount.toFixed(2)} — ${providerName} error: ${err instanceof Error ? err.message : 'unknown'}. The customer can retry from checkout.`,
            link: '/orders',
            data: { order_id: String(order.id) },
            dedupeKey: `staff-alert:PAYMENT_INIT_FAILED:${order.id}`,
        });
    } catch (notifyErr) {
        console.error('[notifications] payment init failure alert failed:', notifyErr);
    }
}
