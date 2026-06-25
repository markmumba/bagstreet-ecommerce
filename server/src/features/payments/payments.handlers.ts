import type { Context } from 'hono';
import { paymentsQueries } from './payments.queries';
import { ordersQueries } from '../orders/orders.queries';
import { UsersQueries } from '../users/user.queries';
import { notificationsQueries } from '../notifications/notifications.queries';
import { stkPush, parseCallback } from '../../services/mpesa';
import { publishEmail } from '../../services/messagequeue';
import { pushToMany } from '../../lib/sse';
import { success } from '@server/lib/response';
import { BadRequestError, ForbiddenError, NotFoundError } from '@server/lib/errors';

interface JWTPayload { sub: string; email: string; role: string }

function getAuthUser(c: Context): JWTPayload {
    return c.get('user') as JWTPayload;
}

export const paymentsHandlers = {
    initiate: async (c: Context) => {
        const { sub } = getAuthUser(c);
        const { order_id, phone } = await c.req.json<{ order_id: number; phone: string }>();

        if (!order_id || !phone) throw new BadRequestError('order_id and phone are required');

        const order = await ordersQueries.findById(order_id);
        if (!order) throw new NotFoundError('Order', order_id);
        if (String(order.user_id) !== sub) throw new ForbiddenError();
        if (order.status !== 'PENDING') throw new BadRequestError('Order is not in PENDING state');
        if ((order as any).payment_status === 'PAID') throw new BadRequestError('Order is already paid');

        const { checkoutRequestId, merchantRequestId } = await stkPush({
            phone,
            amount: parseFloat(order.total_amount as any),
            orderId: order.id,
        });

        await paymentsQueries.createTransaction(
            order.id,
            checkoutRequestId,
            merchantRequestId,
            phone,
            parseFloat(order.total_amount as any)
        );

        return success(c, { checkout_request_id: checkoutRequestId }, 'STK Push sent — check your phone');
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
                const actualCustomer = await UsersQueries.findById((order as any).user_id);
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
            await paymentsQueries.markOrderFailed(tx.order_id);
            console.log(`[mpesa] payment failed for order ${tx.order_id}: ${parsed.resultDesc}`);
        }

        // Always return 200 to Safaricom
        return c.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    },
};
