import type { AppContext } from '@server/lib/hono';
import { paymentsQueries } from './payments.queries';
import { ordersQueries } from '../orders/orders.queries';
import { normalisePhone } from '../../lib/phone';
import { success } from '@server/lib/response';
import { BadRequestError, ForbiddenError, NotFoundError } from '@server/lib/errors';
import { ORDER_STATUS, PAYMENT_STATUS, USER_ROLE } from "shared/dist";
import { env } from '../../config/env';
import { confirmOrderPayment, notifyPaymentFailed } from '../../services/order-payments';
import type { AuthUser } from '@server/lib/hono';
import { getOptionalUser } from '@server/lib/hono';
import { getPesapalTransactionStatus, submitPesapalOrder } from '../../services/pesapal';
import { normalizeShippingAddress } from '../../lib/shipping-address';

function getOptionalAuthUser(c: AppContext): AuthUser | null {
    return getOptionalUser(c);
}

function canAccessOrder(authUser: AuthUser | null, order: any, phone?: string, email?: string) {
    const isStaff = authUser?.role === USER_ROLE.ADMIN || authUser?.role === USER_ROLE.MANAGER;
    const isOwner = authUser && order.user_id != null && String(order.user_id) === authUser.sub;
    const isOrderPhone = phone
        ? normalisePhone(String(order.customer_phone ?? '')) === normalisePhone(phone)
        : false;
    const isOrderEmail = email
        ? String(order.customer_email ?? '').toLowerCase() === email.toLowerCase()
        : false;

    return Boolean(isStaff || isOwner || isOrderPhone || isOrderEmail);
}

async function processPesapalTransaction(tx: Awaited<ReturnType<typeof paymentsQueries.findProviderTransactionByOrderId>>) {
    if (!tx?.provider_reference) {
        return { status: ORDER_STATUS.PENDING, order_id: tx?.order_id };
    }

    const status = await getPesapalTransactionStatus(tx.provider_reference);
    const description = status.payment_status_description?.toUpperCase();
    const eventKey = [
        tx.provider_reference,
        description || 'UNKNOWN',
        status.confirmation_code || status.status_code || status.description || 'NO_DETAIL',
    ].join(':');
    const isNewEvent = await paymentsQueries.createProcessedPaymentEvent({
        provider: tx.provider,
        event_key: eventKey,
        payment_transaction_id: tx.id,
        raw_payload: status.raw,
    });

    if (!isNewEvent) {
        return {
            status: description === 'COMPLETED'
                ? PAYMENT_STATUS.PAID
                : description === 'FAILED' || description === 'REVERSED' || description === 'INVALID'
                    ? PAYMENT_STATUS.FAILED
                    : ORDER_STATUS.PENDING,
            order_id: tx.order_id,
            receipt_number: status.confirmation_code,
            payment_method: status.payment_method,
        };
    }

    if (description === 'COMPLETED') {
        await paymentsQueries.updateProviderTransaction(tx.id, {
            status: 'COMPLETED',
            payment_method: status.payment_method ?? null,
            confirmation_code: status.confirmation_code ?? null,
            result_desc: status.description ?? null,
            raw_payload: status.raw,
        });
        await confirmOrderPayment(tx.order_id, {
            transactionId: tx.id,
            amount: status.amount && status.amount > 0 ? status.amount : parseFloat(tx.amount),
            currency: status.currency ?? tx.currency,
            reference: status.confirmation_code
                ? `pesapal:${status.confirmation_code}`
                : `pesapal:${tx.provider_reference}:completed`,
            metadata: {
                provider: tx.provider,
                provider_reference: tx.provider_reference,
                merchant_reference: tx.merchant_reference,
                payment_method: status.payment_method,
                payment_account: status.payment_account,
                event_key: eventKey,
            },
        });
        return {
            status: PAYMENT_STATUS.PAID,
            order_id: tx.order_id,
            receipt_number: status.confirmation_code,
            payment_method: status.payment_method,
        };
    }

    if (description === 'FAILED' || description === 'REVERSED' || description === 'INVALID') {
        await paymentsQueries.updateProviderTransaction(tx.id, {
            status: description === 'REVERSED' ? 'REVERSED' : 'FAILED',
            payment_method: status.payment_method ?? null,
            confirmation_code: status.confirmation_code ?? null,
            result_desc: status.description ?? null,
            raw_payload: status.raw,
        });
        await paymentsQueries.markOrderFailed(tx.order_id);
        await notifyPaymentFailed(tx.order_id, status.description);
        return { status: PAYMENT_STATUS.FAILED, order_id: tx.order_id };
    }

    await paymentsQueries.updateProviderTransaction(tx.id, {
        status: 'PENDING',
        payment_method: status.payment_method ?? null,
        confirmation_code: status.confirmation_code ?? null,
        result_desc: status.description ?? null,
        raw_payload: status.raw,
    });
    return { status: ORDER_STATUS.PENDING, order_id: tx.order_id };
}

async function readPesapalNotification(c: AppContext) {
    if (c.req.method === 'GET') {
        return {
            orderTrackingId: c.req.query('OrderTrackingId') ?? '',
            orderMerchantReference: c.req.query('OrderMerchantReference') ?? '',
            orderNotificationType: c.req.query('OrderNotificationType') ?? '',
        };
    }

    const body = await c.req.json().catch(() => ({}));
    return {
        orderTrackingId: String(body.OrderTrackingId ?? body.orderTrackingId ?? ''),
        orderMerchantReference: String(body.OrderMerchantReference ?? body.orderMerchantReference ?? ''),
        orderNotificationType: String(body.OrderNotificationType ?? body.orderNotificationType ?? ''),
    };
}

export const paymentsHandlers = {
    initiatePesapal: async (c: AppContext) => {
        const authUser = getOptionalAuthUser(c);
        const { order_id, phone, email } = await c.req.json<{ order_id: number; phone?: string; email?: string }>();

        if (!order_id) throw new BadRequestError('order_id is required');

        const order = await ordersQueries.findById(order_id);
        if (!order) throw new NotFoundError('Order', order_id);
        if (!canAccessOrder(authUser, order, phone, email)) throw new ForbiddenError();
        if ((order as any).payment_status === PAYMENT_STATUS.PAID) {
            return success(c, { status: PAYMENT_STATUS.PAID, order_id: order.id }, 'Payment already confirmed');
        }

        const existing = await paymentsQueries.findProviderTransactionByOrderId(order.id, 'pesapal');
        if (existing?.checkout_url) {
            return success(c, {
                order_id: order.id,
                payment_provider: 'pesapal',
                payment_reference: existing.provider_reference,
                payment_redirect_url: existing.checkout_url,
            }, 'Continue to secure payment');
        }

        const customerEmail = String((order as any).customer_email ?? email ?? '');
        if (!customerEmail) throw new BadRequestError('Email is required to start payment');

        const shippingAddress = normalizeShippingAddress(order.shipping_address, {
            fullName: (order as any).customer_name,
            phone: (order as any).customer_phone,
            email: (order as any).customer_email,
        });
        const payment = await submitPesapalOrder({
            orderId: order.id,
            orderNumber: (order as any).order_number,
            amount: parseFloat(order.total_amount as any),
            phone: String((order as any).customer_phone ?? phone ?? ''),
            email: customerEmail,
            fullName: String((order as any).customer_name ?? shippingAddress?.full_name ?? 'Customer'),
            addressLine1: shippingAddress?.address_line1,
            addressLine2: shippingAddress?.address_line2,
            city: shippingAddress?.city,
            state: shippingAddress?.state,
        });

        const tx = await paymentsQueries.createProviderTransaction({
            order_id: order.id,
            provider: 'pesapal',
            provider_reference: payment.orderTrackingId,
            merchant_reference: payment.merchantReference,
            checkout_url: payment.redirectUrl,
            amount: parseFloat(order.total_amount as any),
            currency: env.PESAPAL_CURRENCY,
            status: payment.redirectUrl ? 'PENDING' : 'INITIATED',
            raw_payload: payment.raw,
        });

        return success(c, {
            order_id: order.id,
            payment_provider: tx.provider,
            payment_reference: tx.provider_reference,
            payment_redirect_url: tx.checkout_url,
        }, tx.checkout_url ? 'Continue to secure payment' : 'Payment is pending');
    },

    pesapalStatus: async (c: AppContext) => {
        const authUser = getOptionalAuthUser(c);
        const { order_id, order_tracking_id, phone, email } = await c.req.json<{
            order_id?: number;
            order_tracking_id?: string;
            phone?: string;
            email?: string;
        }>();

        let tx = order_tracking_id
            ? await paymentsQueries.findProviderTransactionByReference('pesapal', order_tracking_id)
            : undefined;
        if (!tx && order_id) {
            tx = await paymentsQueries.findProviderTransactionByOrderId(order_id, 'pesapal');
        }
        if (!tx) throw new NotFoundError('Payment transaction', order_tracking_id ?? order_id ?? 'unknown');

        const order = await ordersQueries.findById(tx.order_id);
        if (!order) throw new NotFoundError('Order', tx.order_id);
        if (!canAccessOrder(authUser, order, phone, email)) throw new ForbiddenError();

        if ((order as any).payment_status === PAYMENT_STATUS.PAID) {
            return success(c, { status: PAYMENT_STATUS.PAID, order_id: order.id }, 'Payment already confirmed');
        }

        const result = await processPesapalTransaction(tx);
        const message = result.status === PAYMENT_STATUS.PAID
            ? 'Payment confirmed'
            : result.status === PAYMENT_STATUS.FAILED
                ? 'Payment failed'
                : 'Payment is still pending';
        return success(c, result, message);
    },

    pesapalCallback: async (c: AppContext) => {
        const payload = await readPesapalNotification(c);
        const tx = payload.orderTrackingId
            ? await paymentsQueries.findProviderTransactionByReference('pesapal', payload.orderTrackingId)
            : undefined;

        let redirectStatus = 'pending';
        let orderId = '';
        if (tx) {
            const result = await processPesapalTransaction(tx);
            redirectStatus = result.status === PAYMENT_STATUS.PAID
                ? 'paid'
                : result.status === PAYMENT_STATUS.FAILED
                ? 'failed'
                : 'pending';
            const order = await ordersQueries.findById(tx.order_id);
            orderId = String((order as any)?.public_id ?? tx.order_id);
        }

        const redirect = new URL('/checkout', env.STOREFRONT_URL);
        redirect.searchParams.set('payment', redirectStatus);
        if (orderId) redirect.searchParams.set('order_id', orderId);
        return c.redirect(redirect.toString());
    },

    pesapalIpn: async (c: AppContext) => {
        const payload = await readPesapalNotification(c);
        const tx = payload.orderTrackingId
            ? await paymentsQueries.findProviderTransactionByReference('pesapal', payload.orderTrackingId)
            : undefined;

        if (tx) {
            await processPesapalTransaction(tx);
        } else {
            console.warn('[pesapal] unknown orderTrackingId:', payload.orderTrackingId);
        }

        return c.json({
            orderNotificationType: payload.orderNotificationType || 'IPNCHANGE',
            orderTrackingId: payload.orderTrackingId,
            orderMerchantReference: payload.orderMerchantReference,
            status: tx ? 200 : 500,
        });
    },

    completeDevPayment: async (c: AppContext) => {
        if (env.NODE_ENV === 'production') {
            throw new NotFoundError('Payment route', 'dev-complete');
        }

        const authUser = getOptionalAuthUser(c);
        const { order_id, phone } = await c.req.json<{ order_id: number; phone?: string }>();

        if (!order_id) throw new BadRequestError('order_id is required');

        const order = await ordersQueries.findById(order_id);
        if (!order) throw new NotFoundError('Order', order_id);

        const normalizedPhone = phone ? normalisePhone(phone) : '';
        const isStaff = authUser?.role === USER_ROLE.ADMIN || authUser?.role === USER_ROLE.MANAGER;
        const isOwner = authUser && order.user_id != null && String(order.user_id) === authUser.sub;
        const isOrderPhone = normalizedPhone && normalisePhone(String((order as any).customer_phone ?? '')) === normalizedPhone;
        if (!isStaff && !isOwner && !isOrderPhone) throw new ForbiddenError();

        if ((order as any).payment_status !== PAYMENT_STATUS.PAID) {
            await confirmOrderPayment(order.id);
        }

        return success(c, { status: PAYMENT_STATUS.PAID, order_id: order.id }, 'Development payment completed');
    },
};
