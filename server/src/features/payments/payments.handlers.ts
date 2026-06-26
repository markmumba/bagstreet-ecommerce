import type { Context } from 'hono';
import { paymentsQueries } from './payments.queries';
import { ordersQueries } from '../orders/orders.queries';
import { UsersQueries } from '../users/user.queries';
import { notificationsQueries } from '../notifications/notifications.queries';
import { normalisePhone, stkPush, parseCallback, queryStkPushStatus } from '../../services/mpesa';
import { publishEmail } from '../../services/messagequeue';
import { pushToMany } from '../../lib/sse';
import { success } from '@server/lib/response';
import { BadRequestError, ForbiddenError, NotFoundError } from '@server/lib/errors';
import { ORDER_STATUS, PAYMENT_STATUS, USER_ROLE } from "shared/dist";


interface JWTPayload { sub: string; email: string; role: string }

function getAuthUser(c: Context): JWTPayload {
    return c.get('user') as JWTPayload;
}

function getOptionalAuthUser(c: Context): JWTPayload | null {
    return (c.get('user') as JWTPayload | undefined) ?? null;
}

export const paymentsHandlers = {
    initiate: async (c: Context) => {
        const { sub } = getAuthUser(c);
        const { order_id, phone } = await c.req.json<{ order_id: number; phone: string }>();

        if (!order_id || !phone) throw new BadRequestError('order_id and phone are required');

        const order = await ordersQueries.findById(order_id);
        if (!order) throw new NotFoundError('Order', order_id);
        if (String(order.user_id) !== sub) throw new ForbiddenError();
        if (order.status !== ORDER_STATUS.PENDING) throw new BadRequestError('Order is not in PENDING state');
        if ((order as any).payment_status === PAYMENT_STATUS.PAID) throw new BadRequestError('Order is already paid');

        const normalizedPhone = normalisePhone(phone);
        const recent = await paymentsQueries.findRecentTransactionByOrderAndPhone(order.id, normalizedPhone, 30);
        if (recent) {
            throw new BadRequestError('A payment prompt was sent recently. Please wait a few seconds before retrying.');
        }

        const { checkoutRequestId, merchantRequestId } = await stkPush({
            phone,
            amount: parseFloat(order.total_amount as any),
            orderId: order.id,
        });

        await paymentsQueries.createTransaction(
            order.id,
            checkoutRequestId,
            merchantRequestId,
            normalizedPhone,
            parseFloat(order.total_amount as any)
        );

        return success(c, { checkout_request_id: checkoutRequestId }, 'STK Push sent — check your phone');
    },

    resend: async (c: Context) => {
        const authUser = getOptionalAuthUser(c);
        const { order_id, phone } = await c.req.json<{ order_id: number; phone: string }>();

        if (!order_id || !phone) throw new BadRequestError('order_id and phone are required');

        const order = await ordersQueries.findById(order_id);
        if (!order) throw new NotFoundError('Order', order_id);

        const normalizedPhone = normalisePhone(phone);
        const isStaff = authUser?.role === USER_ROLE.ADMIN || authUser?.role === USER_ROLE.MANAGER;
        const isOwner = authUser && order.user_id != null && String(order.user_id) === authUser.sub;
        const isOrderPhone = normalisePhone(String((order as any).customer_phone ?? '')) === normalizedPhone;
        if (!isStaff && !isOwner && !isOrderPhone) throw new ForbiddenError();
        if ((order as any).payment_status === PAYMENT_STATUS.PAID) throw new BadRequestError('Order is already paid');
        if (order.status !== ORDER_STATUS.PENDING) throw new BadRequestError('Only pending orders can be retried');

        const recent = await paymentsQueries.findRecentTransactionByOrderAndPhone(order.id, normalizedPhone, 30);
        if (recent) {
            throw new BadRequestError('A payment prompt was sent recently. Please wait a few seconds before retrying.');
        }

        const { checkoutRequestId, merchantRequestId } = await stkPush({
            phone,
            amount: parseFloat(order.total_amount as any),
            orderId: order.id,
        });

        await paymentsQueries.createTransaction(
            order.id,
            checkoutRequestId,
            merchantRequestId,
            normalizedPhone,
            parseFloat(order.total_amount as any)
        );

        return success(c, { checkout_request_id: checkoutRequestId }, 'A new M-Pesa prompt has been sent');
    },

    status: async (c: Context) => {
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

        if ((order as any).payment_status === PAYMENT_STATUS.PAID) {
            return success(c, { status: PAYMENT_STATUS.PAID, order_id: order.id }, 'Payment already confirmed');
        }

        const amount = parseFloat(order.total_amount as any);
        const tx = await paymentsQueries.findByOrderId(order.id);

        if (tx?.checkout_request_id && !tx.checkout_request_id.startsWith('mock-')) {
            const stkStatus = await queryStkPushStatus(tx.checkout_request_id);
            if (stkStatus.status === 'COMPLETED') {
                await paymentsQueries.updateTransaction(tx.id, {
                    status: 'COMPLETED',
                    result_code: stkStatus.resultCode,
                    result_desc: stkStatus.resultDesc,
                });
                await paymentsQueries.markOrderPaid(order.id);
                return success(c, { status: PAYMENT_STATUS.PAID, order_id: order.id }, 'Payment confirmed');
            }

            if (stkStatus.status === 'FAILED' || stkStatus.status === 'CANCELLED') {
                await paymentsQueries.updateTransaction(tx.id, {
                    status: stkStatus.status,
                    result_code: stkStatus.resultCode,
                    result_desc: stkStatus.resultDesc,
                });
            }
        }

        const matchPhone = normalizedPhone || tx?.phone;
        if (matchPhone) {
            const c2bMatch = await paymentsQueries.findRecentC2BMatch(matchPhone, amount);
            if (c2bMatch) {
                await paymentsQueries.markOrderPaid(order.id);
                await paymentsQueries.markC2BMatched(c2bMatch.id, order.id);
                return success(c, {
                    status: PAYMENT_STATUS.PAID,
                    order_id: order.id,
                    receipt_number: c2bMatch.transaction_id,
                }, 'Manual M-Pesa payment matched and confirmed');
            }
        }

        return success(
            c,
            { status: ORDER_STATUS.PENDING, order_id: order.id },
            'Payment has not been received yet. Please try again in a moment.'
        );
    },

    callback: async (c: Context) => {
        let body: any;
        try {
            body = await c.req.json();
        } catch {
            return c.json({ ResultCode: 0, ResultDesc: 'Accepted' });
        }

        let parsed: ReturnType<typeof parseCallback>;
        try {
            parsed = parseCallback(body);
        } catch (err) {
            console.error('[mpesa] callback parse error:', err);
            return c.json({ ResultCode: 0, ResultDesc: 'Accepted' });
        }

        const tx = await paymentsQueries.findByCheckoutRequestId(parsed.checkoutRequestId);
        if (!tx) {
            console.warn('[mpesa] unknown checkoutRequestId:', parsed.checkoutRequestId);
            return c.json({ ResultCode: 0, ResultDesc: 'Accepted' });
        }

        if (parsed.success) {
            await paymentsQueries.updateTransaction(tx.id, {
                status: 'COMPLETED',
                result_code: parsed.resultCode,
                result_desc: parsed.resultDesc,
                mpesa_receipt_number: parsed.receiptNumber,
            });
            await paymentsQueries.markOrderPaid(tx.order_id);

            // Fire confirmation email
            const order = await ordersQueries.findById(tx.order_id);
            const items = await ordersQueries.findItemsByOrderId(tx.order_id);
            if (order) {
                const actualCustomer = (order as any).user_id
                    ? await UsersQueries.findById((order as any).user_id)
                    : null;
                if (actualCustomer) {
                    publishEmail({
                        type: 'ORDER_CONFIRMATION',
                        to: actualCustomer.email,
                        name: actualCustomer.full_name,
                        orderId: tx.order_id,
                        items: items.map((item) => ({
                            product_name: item.product_name,
                            variant_size: item.variant_size,
                            variant_color: item.variant_color,
                            quantity: item.quantity,
                            unit_price: parseFloat(item.unit_price),
                            subtotal: parseFloat(item.subtotal),
                        })),
                        totalAmount: parseFloat(order.total_amount as any),
                        shippingAddress: order.shipping_address as any,
                    }).catch((err) => console.error('[mpesa] email publish failed:', err));
                }

                // SSE push to admins
                const adminIds = await notificationsQueries.findAdminIds();
                if (adminIds.length > 0) {
                    pushToMany(adminIds, 'order_paid', { order_id: tx.order_id });
                }
            }
        } else {
            await paymentsQueries.updateTransaction(tx.id, {
                status: 'FAILED',
                result_code: parsed.resultCode,
                result_desc: parsed.resultDesc,
            });
            console.log(`[mpesa] payment failed for order ${tx.order_id}: ${parsed.resultDesc}`);
        }

        // Always return 200 to Safaricom
        return c.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    },

    c2bCallback: async (c: Context) => {
        let body: any;
        try {
            body = await c.req.json();
        } catch {
            return c.json({ ResultCode: 0, ResultDesc: 'Accepted' });
        }

        const transactionId = String(body.TransID ?? body.TransId ?? body.transaction_id ?? '');
        const phone = normalisePhone(String(body.MSISDN ?? body.PhoneNumber ?? body.phone ?? ''));
        const amount = Number(body.TransAmount ?? body.Amount ?? body.amount ?? 0);
        const billRefNumber = body.BillRefNumber ?? body.AccountReference ?? null;

        if (!transactionId || !phone || !amount) {
            console.warn('[mpesa] C2B callback missing required fields:', body);
            return c.json({ ResultCode: 0, ResultDesc: 'Accepted' });
        }

        const c2b = await paymentsQueries.createC2BPayment({
            transaction_id: transactionId,
            phone,
            amount,
            bill_ref_number: billRefNumber,
            raw_payload: body,
        });

        const refOrderId = String(billRefNumber ?? '').match(/\d+/)?.[0];
        const orderFromRef = refOrderId
            ? await ordersQueries.findById(Number(refOrderId))
            : undefined;

        if (orderFromRef && (orderFromRef as any).payment_status !== PAYMENT_STATUS.PAID) {
            const orderAmount = parseFloat(orderFromRef.total_amount as any);
            if (orderAmount === amount) {
                await paymentsQueries.markOrderPaid(orderFromRef.id);
                await paymentsQueries.markC2BMatched(c2b.id, orderFromRef.id);
            }
        }

        return c.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    },
};
