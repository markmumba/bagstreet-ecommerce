import { alertStaff } from '../staff-alerts/staff-alerts';
import { mpesaPhone } from './mpesa-payments';
import { activeProvider, type ProviderName } from './payment-providers';

export interface StartedPayment {
    provider: ProviderName;
    /** The attempt's provider reference, or null when no prompt went out (the payment screen lets them retry). */
    reference: string | null;
}

/**
 * Sends the M-Pesa PIN prompt for an order that was just created, through whichever provider is
 * switched on. If it can't be reached the order still exists (the customer can retry from the
 * payment screen) and staff are told.
 */
export async function startOnlinePayment(
    order: { id: number; order_number?: string | null },
    amount: number,
    payer: { phone: string; email: string },
): Promise<StartedPayment> {
    const provider = activeProvider();
    const phone = mpesaPhone(payer.phone);
    // Not an M-Pesa line (e.g. a landline): the payment screen asks for one.
    if (!phone) return { provider: provider.name, reference: null };
    try {
        const tx = await provider.send(order, amount, { phone, email: payer.email });
        return { provider: provider.name, reference: tx.provider_reference };
    } catch (err) {
        console.error(`[${provider.name}] M-Pesa prompt failed:`, err);
        await notifyPaymentInitFailed(order, amount, provider.name, err);
        return { provider: provider.name, reference: null };
    }
}

/** Tells staff when an order was created but the provider couldn't start the payment (e.g. it is down). */
async function notifyPaymentInitFailed(order: { id: number; order_number?: string | null }, amount: number, provider: ProviderName, err: unknown) {
    try {
        await alertStaff({
            audience: 'money',
            type: 'PAYMENT_INIT_FAILED',
            title: `Payment could not start for ${order.order_number ?? `#${order.id}`}`,
            body: `KES ${amount.toFixed(2)} — ${provider === 'paystack' ? 'Paystack' : 'M-Pesa'} error: ${err instanceof Error ? err.message : 'unknown'}. The customer can retry from checkout.`,
            link: '/orders',
            data: { order_id: String(order.id) },
            dedupeKey: `staff-alert:PAYMENT_INIT_FAILED:${order.id}`,
        });
    } catch (notifyErr) {
        console.error('[notifications] payment init failure alert failed:', notifyErr);
    }
}
