import { PAYMENT_STATUS } from 'shared/dist';
import { ordersQueries } from '../features/orders/orders.queries';
import { paymentsQueries } from '../features/payments/payments.queries';
import { UsersQueries } from '../features/users/user.queries';
import { notificationsQueries } from '../features/notifications/notifications.queries';
import { publishEmail } from './messagequeue';
import { pushToMany } from '../lib/sse';
import { env } from '../config/env';
import { createOrderReceivedToken } from '../lib/order-received-token';
import { normalizeShippingAddress } from '../lib/shipping-address';
import { settingsQueries } from '../features/settings/settings.queries';
import { createAuditLog } from '../lib/audit';

export async function notifyStaffOrderConfirmed(order: any, itemCount: number) {
    const shippingAddress = normalizeShippingAddress(order.shipping_address, {
        fullName: order.customer_name,
        phone: order.customer_phone,
        email: order.customer_email,
    });
    const handover = await settingsQueries.getOrderHandover();
    const staff = await UsersQueries.findActiveOrderAlertRecipients(
        handover.enabled ? handover.managerId : null
    );
    for (const user of staff) {
        publishEmail({
            type: 'ADMIN_ORDER_CONFIRMED',
            to: user.email,
            name: user.full_name,
            orderId: Number(order.id),
            orderRef: order.order_number,
            customerName: order.customer_name ?? shippingAddress.full_name ?? 'Customer',
            customerPhone: order.customer_phone ?? '',
            totalAmount: parseFloat(order.total_amount as any),
            itemCount,
        }).catch((err) => console.error('[email] admin order confirmation failed:', err));
    }
}

export async function confirmOrderPayment(orderId: number, payment?: {
    transactionId?: number | null;
    amount?: number | null;
    currency?: string | null;
    reference?: string | null;
    metadata?: unknown;
}): Promise<boolean> {
    const order = await ordersQueries.findById(orderId);
    if (!order) return false;

    const transitioned = await paymentsQueries.markOrderPaid(orderId);
    if (!transitioned) return false;

    const updatedOrder = await ordersQueries.findById(orderId);
    const paidOrder = updatedOrder ?? order;
    const items = await ordersQueries.findItemsByOrderId(orderId);
    const capturedAmount = payment?.amount ?? parseFloat(paidOrder.total_amount as any);
    const currency = payment?.currency ?? 'KES';
    const reference = payment?.reference ?? `order:${orderId}:payment-captured`;

    await paymentsQueries.createLedgerEntry({
        order_id: orderId,
        payment_transaction_id: payment?.transactionId ?? null,
        entry_type: 'PAYMENT_CAPTURED',
        direction: 'CREDIT',
        amount: capturedAmount,
        currency,
        reference,
        metadata: {
            order_id: orderId,
            payment_status: PAYMENT_STATUS.PAID,
            ...((payment?.metadata && typeof payment.metadata === 'object') ? payment.metadata as Record<string, unknown> : {}),
        },
    });

    await createAuditLog({
        action: 'ORDER_PAYMENT_CAPTURED',
        entityType: 'order',
        entityId: orderId,
        before: { payment_status: (order as any).payment_status, status: order.status },
        after: { payment_status: PAYMENT_STATUS.PAID, status: paidOrder.status },
        metadata: {
            payment_transaction_id: payment?.transactionId ?? null,
            reference,
            amount: capturedAmount,
            currency,
        },
    });

    const actualCustomer = (paidOrder as any).user_id
        ? await UsersQueries.findById((paidOrder as any).user_id)
        : null;
    const shippingAddress = normalizeShippingAddress(paidOrder.shipping_address, {
        fullName: (paidOrder as any).customer_name,
        phone: (paidOrder as any).customer_phone,
        email: (paidOrder as any).customer_email,
    });
    const customerEmail = actualCustomer?.email ?? (paidOrder as any).customer_email;
    const customerName = actualCustomer?.full_name ?? (paidOrder as any).customer_name ?? shippingAddress.full_name ?? 'Customer';
    if (customerEmail) {
        const confirmReceivedUrl = new URL('/orders/confirm-received', env.STOREFRONT_URL);
        const publicOrderRef = String((paidOrder as any).public_id ?? orderId);
        const orderRef = (paidOrder as any).order_number ?? `#${String(orderId).padStart(6, '0')}`;
        confirmReceivedUrl.searchParams.set('order_id', publicOrderRef);
        confirmReceivedUrl.searchParams.set('token', createOrderReceivedToken(publicOrderRef));

        publishEmail({
            type: 'ORDER_CONFIRMATION',
            to: customerEmail,
            name: customerName,
            orderId,
            orderRef,
            items: items.map((item) => ({
                product_name: item.product_name,
                variant_size: item.variant_size,
                variant_color: item.variant_color,
                quantity: item.quantity,
                unit_price: parseFloat(item.unit_price),
                subtotal: parseFloat(item.subtotal),
            })),
            totalAmount: parseFloat(paidOrder.total_amount as any),
            shippingAddress,
            confirmReceivedUrl: confirmReceivedUrl.toString(),
        }).catch((err) => console.error('[email] order confirmation failed:', err));
    }

    const handover = await settingsQueries.getOrderHandover();
    const staff = await UsersQueries.findActiveOrderAlertRecipients(
        handover.enabled ? handover.managerId : null
    );
    const staffIds = staff.map((user) => Number(user.id));
    if (staffIds.length > 0) {
        pushToMany(staffIds, 'order_paid', { order_id: orderId });
    }

    await notifyStaffOrderConfirmed(paidOrder, items.reduce((sum, item) => sum + Number(item.quantity), 0));
    return true;
}

export async function notifyPaymentFailed(orderId: number, reason?: string | null): Promise<void> {
    const order = await ordersQueries.findById(orderId);
    if (!order) return;

    const actualCustomer = (order as any).user_id
        ? await UsersQueries.findById((order as any).user_id)
        : null;
    const shippingAddress = normalizeShippingAddress(order.shipping_address, {
        fullName: (order as any).customer_name,
        phone: (order as any).customer_phone,
        email: (order as any).customer_email,
    });
    const customerEmail = actualCustomer?.email ?? (order as any).customer_email;
    if (!customerEmail) return;

    publishEmail({
        type: 'PAYMENT_FAILED',
        to: customerEmail,
        name: actualCustomer?.full_name ?? (order as any).customer_name ?? shippingAddress.full_name ?? 'Customer',
        orderId,
        orderRef: (order as any).order_number,
        reason,
    }).catch((err) => console.error('[email] payment failure failed:', err));

    await createAuditLog({
        action: 'ORDER_PAYMENT_FAILED',
        entityType: 'order',
        entityId: orderId,
        after: { payment_status: PAYMENT_STATUS.FAILED },
        metadata: { reason: reason ?? null },
    });
}
