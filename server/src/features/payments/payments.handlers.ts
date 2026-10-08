import type { AppContext } from '@server/lib/hono';
import { paymentsQueries } from './payments.queries';
import { ordersQueries } from '../orders/orders.queries';
import { normalisePhone } from '../../lib/phone';
import { success } from '@server/lib/response';
import { BadRequestError, ForbiddenError, NotFoundError } from '@server/lib/errors';
import { ORDER_STATUS, PAYMENT_STATUS, USER_ROLE } from "shared/dist";
import { env } from '../../config/env';
import { applyOrderEvent, orderStateOf } from '../orders/lifecycle/order-lifecycle';
import { summariseOrderPayments } from './order-balance';
import { customerView, type Actor, type OrderEvent } from '../orders/lifecycle/transitions';
import type { AuthUser } from '@server/lib/hono';
import { getOptionalUser } from '@server/lib/hono';
import { getPesapalTransactionStatus, submitPesapalOrder } from '../../services/pesapal';
import { normalizeShippingAddress } from '../../lib/shipping-address';
import { createOrderAccessToken, orderTokenRef, verifyOrderAccessToken } from '../../lib/order-received-token';

function getOptionalAuthUser(c: AppContext): AuthUser | null {
    return getOptionalUser(c);
}

function canAccessOrder(authUser: AuthUser | null, order: any, phone?: string, email?: string, token?: string) {
    const isStaff = authUser?.role === USER_ROLE.ADMIN || authUser?.role === USER_ROLE.MANAGER;
    const isOwner = authUser && order.user_id != null && String(order.user_id) === authUser.sub;
    // Signed token issued at checkout — lets a guest manage payment without re-entering phone/email.
    if (token && verifyOrderAccessToken(orderTokenRef(order), token)) return true;
    const isOrderPhone = phone
        ? normalisePhone(String(order.customer_phone ?? '')) === normalisePhone(phone)
        : false;
    const isOrderEmail = email
        ? String(order.customer_email ?? '').toLowerCase() === email.toLowerCase()
        : false;

    return Boolean(isStaff || isOwner || isOrderPhone || isOrderEmail);
}

/** Accepts the numeric id or the public reference (which is what the storefront sees in URLs). */
async function findOrder(orderId?: number | string, orderRef?: string) {
    if (orderRef) return await ordersQueries.findByReference(orderRef);
    if (orderId != null && orderId !== '') return await ordersQueries.findByReference(String(orderId));
    return undefined;
}

/** What the storefront needs to render the payment screen. */
function orderPaymentSummary(order: any) {
    return {
        order_id: Number(order.id),
        order_ref: orderTokenRef(order),
        order_number: order.order_number ?? null,
        total_amount: parseFloat(order.total_amount),
        order_status: order.status,
        payment_status: order.payment_status,
    };
}

const PAYMENT_PROVIDER: Actor = { kind: 'payment_provider' };

/** What the customer's payment screen should show for an order right now. */
function paymentScreenStatus(order: { id: number | string; status: string; payment_status: string }): string {
    return customerView(orderStateOf(order)).status;
}

type PesapalStatus = Awaited<ReturnType<typeof getPesapalTransactionStatus>>;
type ProviderTransaction = NonNullable<Awaited<ReturnType<typeof paymentsQueries.findProviderTransactionByOrderId>>>;

/** Pesapal's report as an Order event, or null while the payment is still in progress. */
function pesapalOrderEvent(tx: ProviderTransaction, status: PesapalStatus, description: string | undefined, eventKey: string): OrderEvent | null {
    switch (description) {
        case 'COMPLETED':
            return {
                type: 'payment_captured',
                amount: status.amount && status.amount > 0 ? status.amount : parseFloat(tx.amount as any),
                currency: status.currency ?? tx.currency,
                reference: status.confirmation_code
                    ? `pesapal:${status.confirmation_code}`
                    : `pesapal:${tx.provider_reference}:completed`,
                transactionId: tx.id,
            };
        case 'REVERSED':
            return { type: 'payment_reversed', reference: `pesapal:${tx.provider_reference}:reversed` };
        case 'FAILED':
        case 'INVALID':
            return { type: 'payment_failed', attemptReference: eventKey, reason: status.description ?? null };
        default:
            return null;
    }
}

/**
 * Asks Pesapal for the payment's status and applies it to the order through the Order lifecycle.
 * Safe to call repeatedly (IPN, redirect, status polling, expiry job): repeats change nothing.
 */
export async function processPesapalTransaction(tx: Awaited<ReturnType<typeof paymentsQueries.findProviderTransactionByOrderId>>) {
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
    // Kept as a record of every distinct report from Pesapal; the lifecycle handles repeats itself.
    const isNewEvent = await paymentsQueries.createProcessedPaymentEvent({
        provider: tx.provider,
        event_key: eventKey,
        payment_transaction_id: tx.id,
        raw_payload: status.raw,
    });

    if (isNewEvent) {
        await paymentsQueries.updateProviderTransaction(tx.id, {
            status: description === 'COMPLETED' ? 'COMPLETED'
                : description === 'REVERSED' ? 'REVERSED'
                : description === 'FAILED' || description === 'INVALID' ? 'FAILED'
                : 'PENDING',
            payment_method: status.payment_method ?? null,
            confirmation_code: status.confirmation_code ?? null,
            result_desc: status.description ?? null,
            raw_payload: status.raw,
        });
    }

    const event = pesapalOrderEvent(tx, status, description, eventKey);
    const order = event
        ? (await applyOrderEvent(tx.order_id, event, PAYMENT_PROVIDER, {
            paymentMetadata: {
                provider: tx.provider,
                provider_reference: tx.provider_reference,
                merchant_reference: tx.merchant_reference,
                payment_method: status.payment_method,
                payment_account: status.payment_account,
                event_key: eventKey,
            },
        })).order
        : await ordersQueries.findById(tx.order_id);

    return {
        status: order ? paymentScreenStatus(order as any) : ORDER_STATUS.PENDING,
        order_id: tx.order_id,
        receipt_number: status.confirmation_code,
        payment_method: status.payment_method,
    };
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
        const { order_id, order_ref, phone, email, token } = await c.req.json<{
            order_id?: number | string;
            order_ref?: string;
            phone?: string;
            email?: string;
            token?: string;
        }>();
        if (!order_id && !order_ref) throw new BadRequestError('order_id or order_ref is required');

        const order = await findOrder(order_id, order_ref);
        if (!order) throw new NotFoundError('Order', order_ref ?? order_id);
        if (!canAccessOrder(authUser, order, phone, email, token)) throw new ForbiddenError();
        // Only an order still waiting for payment can be paid; anything else would charge twice.
        const view = customerView(orderStateOf(order as any));
        if (view.status === 'PAID') {
            return success(c, { status: PAYMENT_STATUS.PAID, order_id: order.id }, 'Payment already confirmed');
        }
        if (view.status === 'EXPIRED') {
            throw new BadRequestError('This order has expired and its items were returned to the shop. Please place a new order.');
        }
        if (view.status === 'REVIEW') {
            throw new BadRequestError('We have received a payment for this order and our team is checking it. Please don\'t pay again.');
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

    /**
     * Current payment state of an order, checked live with Pesapal when a payment was started.
     * Guests prove ownership with the checkout token (or phone/email); never trusts the redirect URL.
     */
    pesapalStatus: async (c: AppContext) => {
        const authUser = getOptionalAuthUser(c);
        const { order_id, order_ref, order_tracking_id, phone, email, token } = await c.req.json<{
            order_id?: number | string;
            order_ref?: string;
            order_tracking_id?: string;
            phone?: string;
            email?: string;
            token?: string;
        }>();

        let tx = order_tracking_id
            ? await paymentsQueries.findProviderTransactionByReference('pesapal', order_tracking_id)
            : undefined;
        const order = tx ? await ordersQueries.findById(tx.order_id) : await findOrder(order_id, order_ref);
        if (!order) throw new NotFoundError('Order', order_ref ?? order_id ?? order_tracking_id ?? 'unknown');
        if (!canAccessOrder(authUser, order, phone, email, token)) throw new ForbiddenError();

        const respond = (status: string, message: string, current: any = order) =>
            success(c, { status, ...orderPaymentSummary(current) }, message);

        // Order state first: a cancelled order is never "paid" to the customer, even if money arrived late.
        const state = orderStateOf(order as any);
        // "We will refund you" only while money is actually still held.
        const moneyHeld = state.status === 'CANCELLED'
            ? summariseOrderPayments(order as any, await paymentsQueries.findLedgerByOrderId(Number(order.id))).net
            : undefined;
        const view = customerView(state, moneyHeld);
        if (view.status === 'EXPIRED') {
            return respond('EXPIRED', view.refundOwed
                ? 'Your payment arrived after this order expired. We will refund you.'
                : state.payment === 'UNPAID' || state.payment === 'FAILED'
                    ? 'This order expired before payment was received'
                    : 'This order was cancelled and your payment has been returned.');
        }
        if (view.status === 'PAID') return respond(PAYMENT_STATUS.PAID, 'Payment confirmed');
        if (view.status === 'REVIEW') return respond('REVIEW', 'We have received a payment and our team is checking it.');

        tx ??= await paymentsQueries.findProviderTransactionByOrderId(Number(order.id), 'pesapal');
        if (!tx) return respond(ORDER_STATUS.PENDING, 'Payment has not been started');

        let result: Awaited<ReturnType<typeof processPesapalTransaction>>;
        try {
            result = await processPesapalTransaction(tx);
        } catch (err) {
            console.error('[pesapal] status check failed:', err);
            return respond(ORDER_STATUS.PENDING, 'We could not reach Pesapal right now. Please try again shortly.');
        }

        const current = await ordersQueries.findById(Number(order.id));
        const message = {
            PAID: 'Payment confirmed',
            FAILED: 'Payment failed',
            REVIEW: 'We have received a payment and our team is checking it.',
            EXPIRED: 'Your payment arrived after this order expired. We will refund you.',
        }[result.status as string] ?? 'Payment is still pending';
        return respond(result.status, message, current ?? order);
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
            orderId = order ? orderTokenRef(order as any) : String(tx.order_id);
        }

        // The storefront re-checks the status with this token rather than trusting `payment=`.
        const redirect = new URL('/checkout', env.STOREFRONT_URL);
        redirect.searchParams.set('payment', redirectStatus);
        if (orderId) {
            redirect.searchParams.set('order_id', orderId);
            redirect.searchParams.set('token', createOrderAccessToken(orderId));
        }
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
        const { order_id, order_ref, phone, token } = await c.req.json<{ order_id?: number; order_ref?: string; phone?: string; token?: string }>();

        if (!order_id && !order_ref) throw new BadRequestError('order_id or order_ref is required');

        const order = await findOrder(order_id, order_ref);
        if (!order) throw new NotFoundError('Order', order_ref ?? order_id);
        if (!canAccessOrder(authUser, order, phone, undefined, token)) throw new ForbiddenError();

        const result = await applyOrderEvent(Number(order.id), {
            type: 'payment_captured',
            amount: parseFloat(order.total_amount as any),
            currency: env.PESAPAL_CURRENCY,
            reference: `dev:${order.id}`,
        }, { kind: 'system' });

        return success(c, { status: paymentScreenStatus(result.order as any), order_id: order.id }, 'Development payment completed');
    },
};
