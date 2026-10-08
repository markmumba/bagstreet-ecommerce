import { ORDER_STATUS, PAYMENT_STATUS } from 'shared/dist';
import { notificationsQueries } from '../features/notifications/notifications.queries';
import { assessCapturedAmount, LEDGER_ENTRY, type CaptureVerdict } from '../features/payments/order-balance';
import { ordersQueries } from '../features/orders/orders.queries';
import { paymentsQueries } from '../features/payments/payments.queries';
import { UsersQueries } from '../features/users/user.queries';
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

    // Provider-reported payments must match the order. A manual "Mark as paid" (no amount) means
    // staff have checked it themselves, including accepting a shortfall.
    let verdict: CaptureVerdict = 'match';
    if (payment?.amount != null) {
        verdict = assessCapturedAmount(parseFloat(order.total_amount as any), payment.amount, payment.currency, env.PESAPAL_CURRENCY);
        if (verdict === 'underpaid' || verdict === 'currency_mismatch') {
            await holdPaymentForReview(order, payment, verdict);
            return false;
        }
    }

    // Payment arrived after the unpaid order expired and released its stock.
    if (order.status === ORDER_STATUS.CANCELLED && (order as any).payment_status !== PAYMENT_STATUS.PAID) {
        const reinstated = await ordersQueries.reinstateCancelled(orderId);
        if (!reinstated) {
            await recordLatePaymentNeedingRefund(order, payment);
            return false;
        }
    }

    const transitioned = await paymentsQueries.markOrderPaid(orderId);
    if (!transitioned) return false;

    const updatedOrder = await ordersQueries.findById(orderId);
    const paidOrder = updatedOrder ?? order;
    const items = await ordersQueries.findItemsByOrderId(orderId);
    const capturedAmount = payment?.amount ?? parseFloat(paidOrder.total_amount as any);
    const currency = payment?.currency ?? 'KES';
    const reference = payment?.reference ?? `order:${orderId}:payment-captured`;

    // A held (underpaid) payment is already in the ledger; staff confirming it accepts that amount
    // rather than adding a second, invented capture for the full total.
    const existingCaptures = (await paymentsQueries.findLedgerByOrderId(orderId))
        .filter((entry) => entry.entry_type === LEDGER_ENTRY.PAYMENT_CAPTURED);
    if (payment?.amount == null && existingCaptures.length > 0) {
        // nothing to record
    } else await paymentsQueries.createLedgerEntry({
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
        const orderNumber = (paidOrder as any).order_number ?? `#${orderId}`;
        const created = await notificationsQueries.create(staffIds.map((id) => ({
            recipient_id: id,
            type: 'NEW_ORDER',
            title: `New order ${orderNumber}`,
            body: `Paid — KES ${capturedAmount.toFixed(2)}`,
            data: { link: '/orders', order_id: String(orderId) },
        })));
        pushToMany(staffIds, 'notification', { notifications: created });
        pushToMany(staffIds, 'order_paid', { order_id: orderId });
    }

    await notifyStaffOrderConfirmed(paidOrder, items.reduce((sum, item) => sum + Number(item.quantity), 0));
    if (verdict === 'overpaid') {
        const difference = capturedAmount - parseFloat(paidOrder.total_amount as any);
        await alertStaff('PAYMENT_MISMATCH', `Overpaid: ${(paidOrder as any).order_number ?? `#${orderId}`}`,
            `Customer paid KES ${capturedAmount.toFixed(2)} for a KES ${parseFloat(paidOrder.total_amount as any).toFixed(2)} order. Refund the KES ${difference.toFixed(2)} difference and record it on the order.`,
            orderId);
    }
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

/**
 * The order expired and its items sold out before the customer's payment came through.
 * Record the money (so the books are right), keep the order cancelled, and ask staff to refund.
 */
async function recordLatePaymentNeedingRefund(order: any, payment?: { transactionId?: number | null; amount?: number | null; currency?: string | null; reference?: string | null }) {
    const recorded = await paymentsQueries.markCancelledOrderPaid(Number(order.id));
    if (!recorded) return;

    const amount = payment?.amount ?? parseFloat(order.total_amount);
    await paymentsQueries.createLedgerEntry({
        order_id: Number(order.id),
        payment_transaction_id: payment?.transactionId ?? null,
        entry_type: 'PAYMENT_CAPTURED',
        direction: 'CREDIT',
        amount,
        currency: payment?.currency ?? 'KES',
        reference: payment?.reference ?? `order:${order.id}:late-payment`,
        metadata: { order_id: Number(order.id), late_payment: true, refund_required: true },
    });
    await createAuditLog({
        action: 'ORDER_LATE_PAYMENT_REFUND_REQUIRED',
        entityType: 'order',
        entityId: Number(order.id),
        before: { status: order.status, payment_status: order.payment_status },
        after: { status: ORDER_STATUS.CANCELLED, payment_status: PAYMENT_STATUS.PAID },
        metadata: { amount, reference: payment?.reference ?? null },
    });

    const handover = await settingsQueries.getOrderHandover();
    const staff = await UsersQueries.findActiveOrderAlertRecipients(handover.enabled ? handover.managerId : null);
    const staffIds = staff.map((user) => Number(user.id));
    if (staffIds.length === 0) return;
    const orderNumber = order.order_number ?? `#${order.id}`;
    const created = await notificationsQueries.create(staffIds.map((id) => ({
        recipient_id: id,
        type: 'REFUND_REQUIRED',
        title: `Refund needed: ${orderNumber}`,
        body: `Paid KES ${amount.toFixed(2)} after the order expired, and the items are no longer in stock. Contact ${order.customer_name ?? 'the customer'} (${order.customer_phone ?? 'no phone'}) to refund or offer an alternative.`,
        data: { link: '/orders', order_id: String(order.id) },
    })));
    pushToMany(staffIds, 'notification', { notifications: created });
}

async function alertStaff(type: string, title: string, body: string, orderId: number) {
    try {
        const handover = await settingsQueries.getOrderHandover();
        const staff = await UsersQueries.findActiveOrderAlertRecipients(handover.enabled ? handover.managerId : null);
        const staffIds = staff.map((user) => Number(user.id));
        if (staffIds.length === 0) return;
        const created = await notificationsQueries.create(staffIds.map((id) => ({
            recipient_id: id, type, title, body, data: { link: '/orders', order_id: String(orderId) },
        })));
        pushToMany(staffIds, 'notification', { notifications: created });
    } catch (err) {
        console.error(`[notifications] ${type} alert failed:`, err);
    }
}

/**
 * Money arrived but not the right amount (or currency). Record what was received so the books are
 * right, leave the order unconfirmed for staff to resolve, and tell them. Staff then either accept
 * it ("Mark as paid") or cancel and refund. The expiry job skips orders with received money.
 */
async function holdPaymentForReview(
    order: any,
    payment: { transactionId?: number | null; amount?: number | null; currency?: string | null; reference?: string | null; metadata?: unknown },
    verdict: CaptureVerdict,
) {
    const orderId = Number(order.id);
    const amount = payment.amount ?? 0;
    await paymentsQueries.createLedgerEntry({
        order_id: orderId,
        payment_transaction_id: payment.transactionId ?? null,
        entry_type: LEDGER_ENTRY.PAYMENT_CAPTURED,
        direction: 'CREDIT',
        amount,
        currency: payment.currency ?? 'KES',
        reference: payment.reference ?? `order:${orderId}:payment-captured`,
        metadata: {
            order_id: orderId,
            held_for_review: verdict,
            ...((payment.metadata && typeof payment.metadata === 'object') ? payment.metadata as Record<string, unknown> : {}),
        },
    });
    await createAuditLog({
        action: 'ORDER_PAYMENT_MISMATCH',
        entityType: 'order',
        entityId: orderId,
        before: { status: order.status, payment_status: order.payment_status },
        after: { status: order.status, payment_status: order.payment_status },
        metadata: { verdict, amount, currency: payment.currency ?? null, order_total: parseFloat(order.total_amount), reference: payment.reference ?? null },
    });
    const orderNumber = order.order_number ?? `#${orderId}`;
    const what = verdict === 'currency_mismatch'
        ? `${payment.currency} ${amount.toFixed(2)} (expected KES)`
        : `KES ${amount.toFixed(2)} of KES ${parseFloat(order.total_amount).toFixed(2)}`;
    await alertStaff('PAYMENT_MISMATCH', `Payment needs review: ${orderNumber}`,
        `Received ${what}. The order was not confirmed. Check with Pesapal, then either "Mark as paid" to accept it or cancel and refund.`,
        orderId);
}
