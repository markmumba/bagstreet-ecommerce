/**
 * What the Order lifecycle tells people: the emails it queues and the staff alerts it raises.
 * Builders only — the lifecycle adapter decides when, and writes them in its transaction.
 */
import { env } from '../../../config/env';
import { createOrderReceivedToken } from '../../../lib/order-received-token';
import { normalizeShippingAddress } from '../../../lib/shipping-address';
import { UsersQueries } from '../../users/user.queries';
import type { EmailJob } from '../../../services/email-jobs';
import type { OrderEvent, StaffAlertKind } from './transitions';
import type { StaffMember } from '../../staff-alerts/staff-alerts';

const money = (n: number) => `KES ${n.toFixed(2)}`;
const orderLabel = (order: any) => order.order_number ?? `#${order.id}`;

function shippingAddressOf(order: any) {
    return normalizeShippingAddress(order.shipping_address, {
        fullName: order.customer_name,
        phone: order.customer_phone,
        email: order.customer_email,
    });
}

async function customerOf(order: any): Promise<{ email: string | null; name: string }> {
    const account = order.user_id ? await UsersQueries.findById(order.user_id) : null;
    return {
        email: account?.email ?? order.customer_email ?? null,
        name: account?.full_name ?? order.customer_name ?? shippingAddressOf(order).full_name ?? 'Customer',
    };
}

/** The staff "order confirmed" email for one recipient. */
export function staffOrderConfirmedEmail(order: any, itemCount: number) {
    return (member: StaffMember): EmailJob => ({
        type: 'ADMIN_ORDER_CONFIRMED',
        to: member.email,
        name: member.full_name,
        orderId: Number(order.id),
        orderRef: order.order_number,
        customerName: order.customer_name ?? shippingAddressOf(order).full_name ?? 'Customer',
        customerPhone: order.customer_phone ?? '',
        totalAmount: parseFloat(order.total_amount),
        itemCount,
    });
}

/** The customer's order confirmation email, or null when there's no address to send it to. */
export async function orderConfirmationJob(order: any, items: any[]): Promise<EmailJob | null> {
    const orderId = Number(order.id);
    const customer = await customerOf(order);
    if (!customer.email) return null;

    const confirmReceivedUrl = new URL('/orders/confirm-received', env.STOREFRONT_URL);
    const publicOrderRef = String(order.public_id ?? orderId);
    confirmReceivedUrl.searchParams.set('order_id', publicOrderRef);
    confirmReceivedUrl.searchParams.set('token', createOrderReceivedToken(publicOrderRef));

    return {
        type: 'ORDER_CONFIRMATION',
        to: customer.email,
        name: customer.name,
        orderId,
        orderRef: order.order_number ?? `#${String(orderId).padStart(6, '0')}`,
        items: items.map((item) => ({
            product_name: item.product_name,
            variant_size: item.variant_size,
            variant_color: item.variant_color,
            quantity: item.quantity,
            unit_price: parseFloat(item.unit_price),
            subtotal: parseFloat(item.subtotal),
        })),
        totalAmount: parseFloat(order.total_amount),
        shippingAddress: shippingAddressOf(order),
        confirmReceivedUrl: confirmReceivedUrl.toString(),
    };
}

export async function paymentFailedJob(order: any, reason?: string | null): Promise<EmailJob | null> {
    const customer = await customerOf(order);
    if (!customer.email) return null;
    return {
        type: 'PAYMENT_FAILED',
        to: customer.email,
        name: customer.name,
        orderId: Number(order.id),
        orderRef: order.order_number,
        reason: reason ?? null,
    };
}

export async function orderExpiredJob(order: any): Promise<EmailJob | null> {
    const customer = await customerOf(order);
    if (!customer.email) return null;
    return { type: 'ORDER_EXPIRED', to: customer.email, name: customer.name, orderRef: order.order_number ?? `#${order.id}` };
}

/** In-app notification type and wording for each staff alert the lifecycle raises. */
export function staffAlert(
    kind: StaffAlertKind,
    order: any,
    event: OrderEvent,
    money_: { captured: number },
): { type: string; title: string; body: string } {
    const ref = orderLabel(order);
    const total = parseFloat(order.total_amount);
    const customer = `${order.customer_name ?? 'the customer'} (${order.customer_phone ?? 'no phone'})`;
    const received = event.type === 'payment_captured' ? event : null;

    switch (kind) {
        case 'payment_held': {
            const what = received && received.currency.toUpperCase() !== env.PESAPAL_CURRENCY.toUpperCase()
                ? `${received.currency} ${received.amount.toFixed(2)} (expected ${env.PESAPAL_CURRENCY})`
                : `${money(received?.amount ?? 0)} of ${money(total)}`;
            return {
                type: 'PAYMENT_MISMATCH',
                title: `Payment needs review: ${ref}`,
                body: `Received ${what}. The order was not confirmed. Check with Pesapal, then either "Mark as paid" to accept it or cancel and refund.`,
            };
        }
        case 'overpaid': {
            const difference = money_.captured - total;
            return {
                type: 'PAYMENT_MISMATCH',
                title: `Overpaid: ${ref}`,
                body: `Customer paid ${money(money_.captured)} for a ${money(total)} order. Refund the ${money(difference)} difference and record it on the order.`,
            };
        }
        case 'refund_needed':
            return {
                type: 'REFUND_REQUIRED',
                title: `Refund needed: ${ref}`,
                body: `Paid ${money(received?.amount ?? total)} after the order was cancelled${received && received.amount < total - 0.5 ? ', and it was not the full amount' : ', and the items are no longer in stock'}. Contact ${customer} to refund or offer an alternative.`,
            };
        case 'payment_reversed':
            return {
                type: 'PAYMENT_REVERSED',
                title: `Payment reversed: ${ref}`,
                body: `The payment provider took back the money for this order. Decide: cancel and restock, mark it paid if ${customer} paid another way, or write it off.`,
            };
        case 'duplicate_payment':
            return {
                type: 'PAYMENT_DUPLICATE',
                title: `Extra payment on ${ref}`,
                body: `A further ${money(received?.amount ?? 0)} arrived for an order that was already paid. Check with Pesapal and refund it if it was charged twice.`,
            };
    }
}

