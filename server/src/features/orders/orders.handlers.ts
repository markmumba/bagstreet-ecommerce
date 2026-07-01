import { ordersQueries } from './orders.queries';
import { createOrderSchema, updateOrderStatusSchema } from './orders.schema';
import { sql } from '../../lib/db';
import { success, paginated } from '@server/lib/response';
import {
    BadRequestError,
    ForbiddenError,
    InternalServerError,
    NotFoundError,
    ValidationError,
} from '@server/lib/errors';
import type { OrderItemResponse, OrderReceiptResponse, OrderResponse, OrderStatus } from 'shared/dist';
import { ORDER_STATUS, PAYMENT_STATUS, USER_ROLE } from 'shared/dist';
import { notificationsQueries } from '../notifications/notifications.queries';
import { pushToMany } from '../../lib/sse';
import { UsersQueries } from '../users/user.queries';
import { publishEmail } from '../../services/messagequeue';
import { shippingQueries } from '../shipping/shipping.queries';
import { normalisePhone } from '../../lib/phone';
import { paymentsQueries } from '../payments/payments.queries';
import { validateDiscount } from '../discounts/discounts.handlers';
import { discountsQueries } from '../discounts/discounts.queries';
import { settingsQueries } from '../settings/settings.queries';
import { confirmOrderPayment, notifyStaffOrderConfirmed } from '../../services/order-payments';
import type { AppContext, AuthUser } from '@server/lib/hono';
import { getOptionalUser, getRequiredUser } from '@server/lib/hono';
import { submitPesapalOrder } from '../../services/pesapal';
import { env } from '../../config/env';
import { verifyOrderReceivedToken } from '../../lib/order-received-token';
import { normalizeShippingAddress } from '../../lib/shipping-address';
import { auditFromContext } from '@server/lib/audit';

interface VariantRow {
    id: number;
    product_id: number;
    sku: string;
    size: string | null;
    color: string | null;
    stock: number;
    price_override: string | null;
    is_active: boolean;
}

interface ProductRow { id: number; price: string; name: string; is_active: boolean }
interface ProductPricingRow extends ProductRow { sale_price: string | null; sale_ends_at: string | null }

function getAuthUser(c: AppContext): AuthUser {
    return getRequiredUser(c);
}

function getOptionalAuthUser(c: AppContext): AuthUser | null {
    return getOptionalUser(c);
}

function toOrderResponse(order: any, items: any[]): OrderResponse {
    const shippingAddress = normalizeShippingAddress(order.shipping_address, {
        fullName: order.customer_name,
        phone: order.customer_phone,
        email: order.customer_email,
    });

    return {
        id: String(order.id),
        public_id: order.public_id != null ? String(order.public_id) : undefined,
        order_number: order.order_number ?? undefined,
        user_id: order.user_id != null ? String(order.user_id) : '',
        status: order.status,
        total_amount: parseFloat(order.total_amount),
        shipping_cost: parseFloat(order.shipping_cost ?? '0'),
        discount_code: order.discount_code ?? undefined,
        discount_amount: parseFloat(order.discount_amount ?? '0'),
        payment_status: order.payment_status ?? PAYMENT_STATUS.UNPAID,
        shipping_location_id: order.shipping_location_id != null ? String(order.shipping_location_id) : undefined,
        shipping_address: shippingAddress,
        notes: order.notes ?? undefined,
        items: items.map((item): OrderItemResponse => ({
            id: String(item.id),
            product_id: String(item.product_id),
            product_slug: item.product_slug ?? undefined,
            product_name: item.product_name,
            variant_id: item.variant_id != null ? String(item.variant_id) : undefined,
            variant_sku: item.variant_sku ?? undefined,
            variant_size: item.variant_size ?? undefined,
            variant_color: item.variant_color ?? undefined,
            quantity: item.quantity,
            unit_price: parseFloat(item.unit_price),
            subtotal: parseFloat(item.subtotal),
        })),
        created_at: order.created_at,
        updated_at: order.updated_at,
    };
}

async function findOrderByParam(param: string) {
    const order = await ordersQueries.findByReference(param);
    if (!order) throw new NotFoundError('Order', param);
    return order;
}

export const ordersHandlers = {

    list: async (c: AppContext) => {
        const { sub, role: userRole } = getAuthUser(c);
        const isAdmin = userRole === USER_ROLE.ADMIN || userRole === USER_ROLE.MANAGER;

        const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
        const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '20', 10)));
        const statusFilter = c.req.query('status') ?? null;
        const paymentStatusFilter = c.req.query('payment_status') ?? null;

        const [orders, total] = isAdmin
            ? await Promise.all([
                ordersQueries.findAll(page, limit, statusFilter, paymentStatusFilter),
                ordersQueries.countAll(statusFilter, paymentStatusFilter),
              ])
            : await Promise.all([
                ordersQueries.findByUserId(Number(sub), page, limit, statusFilter, paymentStatusFilter),
                ordersQueries.countByUserId(Number(sub), statusFilter, paymentStatusFilter),
              ]);

        const responses = await Promise.all(
            orders.map(async (order) => {
                const items = await ordersQueries.findItemsByOrderId(order.id);
                return toOrderResponse(order, items);
            })
        );

        return paginated(c, responses, page, limit, total);
    },

    get: async (c: AppContext) => {
        const ref = c.req.param('id')!;
        const { sub, role: userRole } = getAuthUser(c);

        const order = await findOrderByParam(ref);

        const isAdmin = userRole === USER_ROLE.ADMIN || userRole === USER_ROLE.MANAGER;
        if (!isAdmin && String(order.user_id) !== sub) throw new ForbiddenError();

        const items = await ordersQueries.findItemsByOrderId(order.id);
        return success(c, toOrderResponse(order, items));
    },

    receipt: async (c: AppContext) => {
        const ref = c.req.param('id')!;
        const { sub, role: userRole } = getAuthUser(c);

        const order = await findOrderByParam(ref);

        const isStaff = userRole === USER_ROLE.ADMIN || userRole === USER_ROLE.MANAGER;
        if (!isStaff && String(order.user_id) !== sub) throw new ForbiddenError();
        if ((order as any).payment_status !== PAYMENT_STATUS.PAID) {
            throw new BadRequestError('Receipt is only available for paid orders');
        }

        const items = await ordersQueries.findItemsByOrderId(order.id);
        const payment = await paymentsQueries.findProviderTransactionByOrderId(order.id, 'pesapal');
        const shippingAddress = normalizeShippingAddress(order.shipping_address, {
            fullName: (order as any).customer_name,
            phone: (order as any).customer_phone,
            email: (order as any).customer_email,
        });
        const subtotal = items.reduce((sum, item) => sum + parseFloat(item.subtotal), 0);
        const orderNumber = (order as any).order_number ?? `BS-${String(order.id).padStart(6, '0')}`;
        const receiptNumber = `RCP-${orderNumber}`;

        const receipt: OrderReceiptResponse = {
            receipt_number: receiptNumber,
            order_id: String((order as any).public_id ?? order.id),
            order_public_id: (order as any).public_id != null ? String((order as any).public_id) : undefined,
            order_number: orderNumber,
            issued_at: new Date().toISOString(),
            paid_at: (order as any).paid_at ?? order.updated_at,
            customer_name: (order as any).customer_name ?? shippingAddress.full_name ?? 'Guest customer',
            customer_email: (order as any).customer_email ?? shippingAddress.email,
            customer_phone: (order as any).customer_phone ?? shippingAddress.phone,
            payment_provider: payment?.provider ?? 'pesapal',
            payment_method: payment?.payment_method ?? undefined,
            payment_reference: payment?.confirmation_code ?? payment?.provider_reference ?? null,
            currency: payment?.currency ?? env.PESAPAL_CURRENCY,
            subtotal,
            shipping_cost: parseFloat((order as any).shipping_cost ?? '0'),
            discount_amount: parseFloat((order as any).discount_amount ?? '0'),
            total_amount: parseFloat(order.total_amount as any),
            items: toOrderResponse(order, items).items,
        };

        return success(c, receipt);
    },

    create: async (c: AppContext) => {
        const authUser = getOptionalAuthUser(c);
        const body = await c.req.json();
        const validated = createOrderSchema.safeParse(body);

        if (!validated.success) {
            throw new ValidationError('Invalid order data', validated.error.errors);
        }
        const customerEmail = authUser?.email ?? validated.data.email?.toLowerCase() ?? null;
        if (!customerEmail) {
            throw new BadRequestError('Email is required for guest checkout');
        }

        // Validate shipping location
        const shippingLocation = await shippingQueries.findById(validated.data.shipping_location_id);
        if (!shippingLocation) throw new BadRequestError('Invalid shipping location');
        if (!shippingLocation.is_active) throw new BadRequestError('Selected shipping location is not available');
        const zoneShippingCost = parseFloat(shippingLocation.price);
        const { county, ...shippingAddressBase } = validated.data.shipping_address;
        const shippingAddress = {
            ...shippingAddressBase,
            state: shippingAddressBase.state ?? county ?? '',
            postal_code: shippingAddressBase.postal_code ?? '',
            country: shippingAddressBase.country ?? 'Kenya',
            phone: shippingAddressBase.phone ?? validated.data.phone,
        };

        const variantMap = new Map<number, VariantRow>();
        for (const item of validated.data.items) {
            if (variantMap.has(item.variant_id)) continue;
            const [variant] = await sql<VariantRow[]>`
                SELECT id, product_id, sku, size, color, stock, price_override, is_active
                FROM product_variants WHERE id = ${item.variant_id}
            `;
            if (variant) variantMap.set(variant.id, variant);
        }

        const productMap = new Map<number, ProductPricingRow>();
        for (const variant of variantMap.values()) {
            if (productMap.has(variant.product_id)) continue;
            const [product] = await sql<ProductPricingRow[]>`
                SELECT id, price, name, is_active, sale_price, sale_ends_at
                FROM products WHERE id = ${variant.product_id}
            `;
            if (product) productMap.set(product.id, product);
        }

        for (const item of validated.data.items) {
            const variant = variantMap.get(item.variant_id);
            if (!variant) throw new BadRequestError(`Variant ${item.variant_id} not found`);
            if (!variant.is_active) throw new BadRequestError(`Variant ${item.variant_id} is not available`);

            const product = productMap.get(variant.product_id);
            if (!product) throw new BadRequestError(`Product for variant ${item.variant_id} not found`);
            if (!product.is_active) throw new BadRequestError(`Product "${product.name}" is not available`);
        }

        const itemsWithPrice = validated.data.items.map((item) => {
            const variant = variantMap.get(item.variant_id)!;
            const product = productMap.get(variant.product_id)!;
            const saleIsActive = product.sale_price != null
                && (!product.sale_ends_at || new Date(product.sale_ends_at).getTime() > Date.now());
            const unitPrice = variant.price_override != null
                ? parseFloat(variant.price_override)
                : saleIsActive
                ? parseFloat(product.sale_price!)
                : parseFloat(product.price);
            return {
                variant_id: item.variant_id,
                product_id: variant.product_id,
                quantity: item.quantity,
                unit_price: unitPrice,
                variant_sku: variant.sku,
                variant_size: variant.size,
                variant_color: variant.color,
            };
        });

        const itemsTotal = itemsWithPrice.reduce(
            (sum, item) => sum + item.unit_price * item.quantity,
            0
        );
        const normalizedPhone = normalisePhone(validated.data.phone);
        const discount = await validateDiscount(validated.data.discount_code, itemsTotal, normalizedPhone);
        if (!discount.valid) throw new BadRequestError(discount.reason ?? 'Discount code is invalid');

        const discountAmount = discount.discountAmount;
        const subtotalAfterDiscount = Math.max(0, itemsTotal - discountAmount);
        const freeDeliveryThreshold = await settingsQueries.getNumber('free_delivery_threshold');
        const shippingCost = freeDeliveryThreshold > 0 && subtotalAfterDiscount >= freeDeliveryThreshold
            ? 0
            : zoneShippingCost;
        const totalAmount = subtotalAfterDiscount + shippingCost;

        let order;
        try {
            order = await ordersQueries.create(
                authUser ? Number(authUser.sub) : null,
                itemsWithPrice,
                totalAmount,
                shippingAddress,
                validated.data.shipping_location_id,
                shippingCost,
                validated.data.notes,
                discount.normalizedCode ?? null,
                discountAmount,
                shippingAddress.full_name,
                normalizedPhone,
                customerEmail
            );
            if (discount.codeId && discountAmount > 0) {
                await discountsQueries.recordUsage({
                    code_id: discount.codeId,
                    order_id: order.id,
                    phone: normalizedPhone,
                    discount_amount: discountAmount,
                });
            }
        } catch (err: any) {
            if (err.message?.includes('Insufficient stock') || err.message?.includes('not found')) {
                throw new BadRequestError(err.message);
            }
            if (err.message?.includes('discount_code_usages_code_id_phone_key')) {
                throw new BadRequestError('This phone number has already used this code');
            }
            throw new InternalServerError('Failed to create order');
        }

        const items = await ordersQueries.findItemsByOrderId(order.id);

        // Notify admins, plus the assigned duty manager when order handover is enabled.
        const orderHandover = await settingsQueries.getOrderHandover();
        const orderAlertRecipients = await UsersQueries.findActiveOrderAlertRecipients(
            orderHandover.enabled ? orderHandover.managerId : null
        );
        const staffIds = orderAlertRecipients.map((user) => Number(user.id));
        if (staffIds.length > 0) {
            const orderNumber = (order as any).order_number ?? `BS-${String(order.id).padStart(6, '0').toUpperCase()}`;
            const notifRows = staffIds.map((id) => ({
                recipient_id: id,
                type: 'NEW_ORDER',
                title: `New Order ${orderNumber}`,
                body: `Order placed for KES ${totalAmount.toFixed(2)}`,
                data: { link: '/orders', order_id: String(order.id) },
            }));
            const created = await notificationsQueries.create(notifRows);
            pushToMany(staffIds, 'notification', { notifications: created });
        }

        // Low stock alerts — check variants that are now below threshold
        const adminIds = await notificationsQueries.findAdminIds();
        if (adminIds.length > 0) {
            const lowStockVariants: { id: number; sku: string; size: string | null; color: string | null; stock: number; low_stock_threshold: number; product_name: string }[] = [];
            const seenVariantIds = new Set<number>();
            for (const item of itemsWithPrice) {
                if (seenVariantIds.has(item.variant_id)) continue;
                seenVariantIds.add(item.variant_id);
                const rows = await sql<{ id: number; sku: string; size: string | null; color: string | null; stock: number; low_stock_threshold: number; product_name: string }[]>`
                    SELECT pv.id, pv.sku, pv.size, pv.color, pv.stock, pv.low_stock_threshold, p.name AS product_name
                    FROM product_variants pv
                    JOIN products p ON p.id = pv.product_id
                    WHERE pv.id = ${item.variant_id}
                      AND pv.stock <= pv.low_stock_threshold
                      AND pv.stock >= 0
                `;
                lowStockVariants.push(...rows);
            }
            if (lowStockVariants.length > 0) {
                const lowStockNotifs: { recipient_id: number; type: string; title: string; body: string; data: object }[] = [];
                for (const variant of lowStockVariants) {
                    const variantLabel = [variant.size, variant.color].filter(Boolean).join(' / ');
                    const title = variant.stock === 0 ? `Out of stock: ${variant.product_name}` : `Low stock: ${variant.product_name}`;
                    const body = `${variantLabel ? `(${variantLabel}) — ` : ''}${variant.stock} unit${variant.stock === 1 ? '' : 's'} remaining`;
                    for (const adminId of adminIds) {
                        lowStockNotifs.push({
                            recipient_id: adminId,
                            type: variant.stock === 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK',
                            title,
                            body,
                            data: { link: '/products', variant_id: String(variant.id) },
                        });
                    }
                }
                const lowStockCreated = await notificationsQueries.create(lowStockNotifs);
                pushToMany(adminIds, 'notification', { notifications: lowStockCreated });

                const staff = await UsersQueries.findActiveAdmins();
                for (const variant of lowStockVariants) {
                    const variantLabel = [variant.size, variant.color].filter(Boolean).join(' / ');
                    for (const user of staff) {
                        publishEmail({
                            type: 'LOW_STOCK_ALERT',
                            to: user.email,
                            name: user.full_name,
                            productName: variant.product_name,
                            variantLabel,
                            stock: variant.stock,
                            threshold: variant.low_stock_threshold,
                        }).catch((err) => console.error('[email] low stock alert failed:', err));
                    }
                }
            }
        }

        let paymentRedirectUrl: string | null = null;
        let paymentReference: string | null = null;
        try {
            const payment = await submitPesapalOrder({
                orderId: order.id,
                orderNumber: (order as any).order_number,
                amount: totalAmount,
                phone: validated.data.phone,
                email: customerEmail,
                fullName: shippingAddress.full_name,
                addressLine1: shippingAddress.address_line1,
                addressLine2: shippingAddress.address_line2,
                city: shippingAddress.city,
                state: shippingAddress.state,
            });
            paymentRedirectUrl = payment.redirectUrl;
            paymentReference = payment.orderTrackingId;
            await paymentsQueries.createProviderTransaction({
                order_id: order.id,
                provider: 'pesapal',
                provider_reference: payment.orderTrackingId,
                merchant_reference: payment.merchantReference,
                checkout_url: payment.redirectUrl,
                amount: totalAmount,
                currency: env.PESAPAL_CURRENCY,
                status: payment.redirectUrl ? 'PENDING' : 'INITIATED',
                raw_payload: payment.raw,
            });
        } catch (err) {
            console.error('[pesapal] payment initialization failed:', err);
        }

        const orderResponse = toOrderResponse(order, items);
        return success(
            c,
            {
                ...orderResponse,
                payment_provider: 'pesapal',
                payment_redirect_url: paymentRedirectUrl,
                payment_reference: paymentReference,
                message: paymentRedirectUrl ? 'Continue to secure payment' : 'Order placed — payment is pending',
            },
            paymentRedirectUrl ? 'Order placed — continue to secure payment' : 'Order placed — payment is pending',
            201
        );
    },

    updateStatus: async (c: AppContext) => {
        const id = parseInt(c.req.param('id')!);
        const body = await c.req.json();
        const validated = updateOrderStatusSchema.safeParse(body);

        if (!validated.success) {
            throw new ValidationError('Invalid status', validated.error.errors);
        }

        const order = await ordersQueries.findById(id);
        if (!order) throw new NotFoundError('Order', id);

        if (order.status === ORDER_STATUS.CANCELLED || order.status === ORDER_STATUS.REFUNDED) {
            throw new BadRequestError(`Cannot update a ${order.status} order`);
        }
        if (order.status === ORDER_STATUS.DELIVERED && validated.data.status !== ORDER_STATUS.REFUNDED) {
            throw new BadRequestError('Received orders can only be refunded');
        }

        if (validated.data.status === ORDER_STATUS.CONFIRMED && (order as any).payment_status !== PAYMENT_STATUS.PAID) {
            throw new BadRequestError('Use Mark as Paid to confirm payment before confirming the order');
        }
        if (validated.data.status === ORDER_STATUS.DELIVERED && (order as any).payment_status !== PAYMENT_STATUS.PAID) {
            throw new BadRequestError('Only paid orders can be marked as received');
        }
        if (validated.data.status === ORDER_STATUS.REFUNDED && (order as any).payment_status !== PAYMENT_STATUS.PAID) {
            throw new BadRequestError('Only paid orders can be refunded');
        }
        if (validated.data.status === ORDER_STATUS.CANCELLED && (order as any).payment_status === PAYMENT_STATUS.PAID) {
            throw new BadRequestError('Paid orders should be refunded instead of cancelled');
        }

        if (validated.data.status === ORDER_STATUS.CANCELLED) {
            await ordersQueries.restoreStock(id);
        }

        const updated = await ordersQueries.updateStatus(id, validated.data.status);
        if (!updated) throw new InternalServerError('Failed to update order status');

        const items = await ordersQueries.findItemsByOrderId(id);
        if (validated.data.status === ORDER_STATUS.CONFIRMED && order.status !== ORDER_STATUS.CONFIRMED) {
            const itemCount = items.reduce((sum, item) => sum + Number(item.quantity), 0);
            await notifyStaffOrderConfirmed(updated, itemCount);
        }
        await auditFromContext(c, {
            action: 'ORDER_STATUS_UPDATED',
            entityType: 'order',
            entityId: id,
            before: { status: order.status, payment_status: (order as any).payment_status },
            after: { status: updated.status, payment_status: (updated as any).payment_status },
        });

        return success(c, toOrderResponse(updated, items), 'Order status updated');
    },

    stats: async (c: AppContext) => {
        const data = await ordersQueries.getStats();
        return success(c, data);
    },

    cancel: async (c: AppContext) => {
        const ref = c.req.param('id')!;
        const { sub } = getAuthUser(c);

        const order = await findOrderByParam(ref);
        const id = order.id;
        if (String(order.user_id) !== sub) throw new ForbiddenError();
        if (order.status !== ORDER_STATUS.PENDING) {
            throw new BadRequestError('Only PENDING orders can be cancelled');
        }

        await ordersQueries.restoreStock(id);
        const updated = await ordersQueries.updateStatus(id, ORDER_STATUS.CANCELLED);
        if (!updated) throw new InternalServerError('Failed to cancel order');

        const items = await ordersQueries.findItemsByOrderId(id);
        return success(c, toOrderResponse(updated, items), 'Order cancelled');
    },

    confirmPayment: async (c: AppContext) => {
        const id = parseInt(c.req.param('id')!);

        const order = await ordersQueries.findById(id);
        if (!order) throw new NotFoundError('Order', id);

        if ((order as any).payment_status === PAYMENT_STATUS.PAID) {
            const items = await ordersQueries.findItemsByOrderId(id);
            return success(c, toOrderResponse(order, items), 'Order payment is already confirmed');
        }

        if (order.status === ORDER_STATUS.CANCELLED || order.status === ORDER_STATUS.REFUNDED) {
            throw new BadRequestError(`Cannot confirm payment for a ${order.status.toLowerCase()} order`);
        }

        await confirmOrderPayment(id);
        const updated = await ordersQueries.findById(id);
        if (!updated) throw new InternalServerError('Failed to confirm payment');

        const items = await ordersQueries.findItemsByOrderId(id);
        await auditFromContext(c, {
            action: 'ORDER_PAYMENT_CONFIRMED',
            entityType: 'order',
            entityId: id,
            before: { status: order.status, payment_status: (order as any).payment_status },
            after: { status: updated.status, payment_status: (updated as any).payment_status },
            metadata: { source: 'manual_admin_action' },
        });
        return success(c, toOrderResponse(updated, items), 'Payment marked as paid');
    },

    confirmReceived: async (c: AppContext) => {
        const ref = c.req.param('id')!;
        const body = await c.req.json().catch(() => ({}));
        const token = typeof body.token === 'string' ? body.token : undefined;

        if (!verifyOrderReceivedToken(ref, token)) {
            throw new ForbiddenError('Invalid or expired confirmation link');
        }

        const order = await findOrderByParam(ref);
        const id = order.id;
        if ((order as any).payment_status !== PAYMENT_STATUS.PAID) {
            throw new BadRequestError('Only paid orders can be marked as received');
        }
        if (order.status === ORDER_STATUS.CANCELLED || order.status === ORDER_STATUS.REFUNDED) {
            throw new BadRequestError(`Cannot mark a ${order.status.toLowerCase()} order as received`);
        }

        const updated = order.status === ORDER_STATUS.DELIVERED
            ? order
            : await ordersQueries.updateStatus(id, ORDER_STATUS.DELIVERED);
        if (!updated) throw new InternalServerError('Failed to confirm order receipt');

        const items = await ordersQueries.findItemsByOrderId(id);
        if (order.status !== ORDER_STATUS.DELIVERED) {
            await auditFromContext(c, {
                action: 'ORDER_RECEIVED_CONFIRMED',
                entityType: 'order',
                entityId: id,
                before: { status: order.status },
                after: { status: updated.status },
                metadata: { source: 'customer_email_link' },
            });
        }
        return success(c, toOrderResponse(updated, items), 'Thanks — your order has been marked as received');
    },
};
