import type { AppContext } from '@server/lib/hono';
import { paymentsQueries } from './payments.queries';
import { ordersQueries } from '../orders/orders.queries';
import { normalisePhone } from '../../lib/phone';
import { success } from '@server/lib/response';
import { BadRequestError, ForbiddenError, NotFoundError, TooManyRequestsError } from '@server/lib/errors';
import { ORDER_SOURCE, ORDER_STATUS, PAYMENT_STATUS, USER_ROLE } from "shared/dist";
import { sql } from '../../lib/db';
import { giftVoucherOrderOf } from '../gift-vouchers/voucher-sales';
import { env } from '../../config/env';
import { orderStateOf } from '../orders/lifecycle/order-lifecycle';
import { orderAmountDue, summariseOrderPayments } from './order-balance';
import { customerView } from '../orders/lifecycle/transitions';
import type { AuthUser } from '@server/lib/hono';
import { getOptionalUser } from '@server/lib/hono';
import { orderTokenRef, verifyOrderAccessToken } from '../../lib/order-received-token';
import { readJsonColumn } from '../../lib/json-column';
import { MAX_PROMPTS_PER_ORDER, PROMPT_REUSE_MS, maskPhone, mpesaPhone, promptPhoneHint } from './prompt-phone';
import { PAYSTACK, processPaystackTransaction, recordPaystackWebhook, sendPaystackPrompt } from './paystack-payments';
import { isValidWebhookSignature } from '../../services/paystack-protocol';

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
        amount_due: orderAmountDue(order),
        order_status: order.status,
        payment_status: order.payment_status,
    };
}

/**
 * Sends (or re-sends) the M-Pesa PIN prompt for an order, through Paystack. A prompt sent under a
 * minute ago to the same phone is reused rather than sent twice (a double tap, or a refresh).
 */
async function initiatePrompt(c: AppContext, order: any, requestedPhone: string | undefined, requestEmail: string | undefined) {
    const phone = mpesaPhone(requestedPhone || order.customer_phone);
    if (!phone) throw new BadRequestError('Enter a Safaricom number M-Pesa can send the payment request to, e.g. 0712 345 678.');

    const latest = await paymentsQueries.findProviderTransactionByOrderId(Number(order.id));
    if (latest?.status === 'PENDING') {
        const sameNumber = readJsonColumn<{ phone?: string }>(latest.raw_payload)?.phone === phone;
        if (sameNumber && latest.provider === PAYSTACK && Date.now() - new Date(latest.created_at).getTime() < PROMPT_REUSE_MS) {
            return success(c, {
                order_id: order.id,
                payment_provider: PAYSTACK,
                payment_reference: latest.provider_reference,
                prompt_phone: maskPhone(phone),
            }, `We've sent a payment request to ${maskPhone(phone)}. Enter your M-Pesa PIN on your phone.`);
        }
        // The last prompt may have been paid while the customer was asking for another.
        const previous = latest.provider === PAYSTACK
            ? await processPaystackTransaction(latest, { force: true }).catch(() => null)
            : null;
        if (previous?.status === PAYMENT_STATUS.PAID) {
            return success(c, { status: PAYMENT_STATUS.PAID, order_id: order.id }, 'Payment already confirmed');
        }
    }

    if (await paymentsQueries.countProviderTransactions(Number(order.id), PAYSTACK) >= MAX_PROMPTS_PER_ORDER) {
        throw new TooManyRequestsError('Too many payment requests for this order. Please contact us and we will help you pay.');
    }

    // Paystack needs an email; online orders always have one.
    const email = String(order.customer_email ?? requestEmail ?? '');
    let tx;
    try {
        tx = await sendPaystackPrompt(order, orderAmountDue(order), { phone, email });
    } catch (err) {
        console.error('[paystack] M-Pesa prompt failed:', err);
        throw new BadRequestError("M-Pesa couldn't send the payment request right now. Please try again in a moment.");
    }
    return success(c, {
        order_id: order.id,
        payment_provider: PAYSTACK,
        payment_reference: tx.provider_reference,
        prompt_phone: maskPhone(phone),
    }, `We've sent a payment request to ${maskPhone(phone)}. Enter your M-Pesa PIN on your phone.`);
}

export const paymentsHandlers = {
    /** Starts (or restarts) M-Pesa payment for an unpaid order. */
    initiatePayment: async (c: AppContext) => {
        const authUser = getOptionalAuthUser(c);
        const { order_id, order_ref, phone, email, token, pay_phone } = await c.req.json<{
            order_id?: number | string;
            order_ref?: string;
            phone?: string;
            email?: string;
            token?: string;
            /** M-Pesa: send the prompt to this number instead of the order's phone. */
            pay_phone?: string;
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

        return initiatePrompt(c, order, pay_phone, email);
    },

    /**
     * Current payment state of an order, checked live with the provider when a payment was started.
     * Guests prove ownership with the checkout token (or phone/email).
     */
    paymentStatus: async (c: AppContext) => {
        const authUser = getOptionalAuthUser(c);
        const { order_id, order_ref, phone, email, token } = await c.req.json<{
            order_id?: number | string;
            order_ref?: string;
            phone?: string;
            email?: string;
            token?: string;
        }>();

        const order = await findOrder(order_id, order_ref);
        if (!order) throw new NotFoundError('Order', order_ref ?? order_id ?? 'unknown');
        if (!canAccessOrder(authUser, order, phone, email, token)) throw new ForbiddenError();

        // The latest attempt, with any provider.
        const tx = await paymentsQueries.findProviderTransactionByOrderId(Number(order.id));
        // A voucher purchase: the payment screen says where the voucher was sent.
        const giftVoucher = (order as any).order_source === ORDER_SOURCE.GIFT_VOUCHER ? await giftVoucherOrderOf(sql, Number(order.id)) : undefined;
        const respond = (status: string, message: string, current: any = order, extra: Record<string, unknown> = {}) =>
            success(c, {
                status,
                payment_provider: PAYSTACK,
                ...extra,
                ...orderPaymentSummary(current),
                order_source: current.order_source,
                gift_voucher: giftVoucher ? {
                    amount: Number(giftVoucher.amount),
                    deliver_to: giftVoucher.deliver_to,
                    recipient_name: giftVoucher.recipient_name,
                    recipient_email: giftVoucher.recipient_email,
                } : undefined,
            }, message);

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

        if (!tx) return respond(ORDER_STATUS.PENDING, 'Payment has not been started');
        // An attempt from a retired provider (Pesapal, Daraja) can't be checked: the customer starts a new one.
        if (tx.provider !== PAYSTACK) return respond(ORDER_STATUS.PENDING, 'Payment has not been started');
        // Where the last prompt went and when, so the screen can say "check your phone".
        const promptInfo = { prompt_phone: promptPhoneHint(tx), prompt_sent_at: new Date(tx.created_at).toISOString() };

        let result: Awaited<ReturnType<typeof processPaystackTransaction>>;
        try {
            result = await processPaystackTransaction(tx);
        } catch (err) {
            console.error(`[${tx.provider}] status check failed:`, err);
            return respond(ORDER_STATUS.PENDING, 'We could not check your payment right now. Please try again shortly.', order, promptInfo);
        }

        const current = await ordersQueries.findById(Number(order.id));
        // The order still says FAILED from an earlier attempt, but the customer has asked for a
        // new prompt that hasn't ended yet: that one is what the screen should wait on.
        const status = result.status === PAYMENT_STATUS.FAILED && !result.failure_reason && tx.status === 'PENDING'
            ? ORDER_STATUS.PENDING
            : result.status;
        const message = {
            PAID: 'Payment confirmed',
            FAILED: 'Payment failed',
            REVIEW: 'We have received a payment and our team is checking it.',
            EXPIRED: 'Your payment arrived after this order expired. We will refund you.',
        }[status as string] ?? 'Payment is still pending';
        return respond(status, message, current ?? order, { ...promptInfo, failure_reason: result.failure_reason ?? undefined });
    },

    /**
     * Paystack's webhook. Only signed requests are accepted; a `charge.success` then triggers a
     * verify of that charge (the order moves on what verify says). Answered straight away —
     * Paystack retries anything that isn't a quick 200.
     */
    paystackWebhook: async (c: AppContext) => {
        const rawBody = await c.req.text();
        const signed = isValidWebhookSignature({
            rawBody,
            signatureHeader: c.req.header('paystack-signature'),
            legacySignatureHeader: c.req.header('x-paystack-signature'),
            signingSecret: env.PAYSTACK_WEBHOOK_SECRET,
            secretKey: env.PAYSTACK_SECRET_KEY,
        });
        if (!signed) return c.json({ message: 'Invalid signature' }, 401);

        let event: { event?: string; data?: { reference?: string } };
        try {
            event = JSON.parse(rawBody);
        } catch {
            return c.json({ message: 'Malformed body' }, 400);
        }
        if (event.event === 'charge.success') {
            void recordPaystackWebhook(event).catch((err) => console.error('[paystack] webhook processing failed:', err));
        }
        return c.json({ received: true });
    },

};
