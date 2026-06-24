import type { Context } from 'hono';
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
import type { OrderItemResponse, OrderResponse } from 'shared/dist';
import { role } from 'shared/dist';
import { notificationsQueries } from '../notifications/notifications.queries';
import { pushToMany } from '../../lib/sse';

interface JWTPayload { sub: string; email: string; role: string }

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

function getAuthUser(c: Context): JWTPayload {
    return c.get('user') as JWTPayload;
}

function toOrderResponse(order: any, items: any[]): OrderResponse {
    return {
        id: String(order.id),
        user_id: String(order.user_id),
        status: order.status,
        total_amount: parseFloat(order.total_amount),
        shipping_address: order.shipping_address,
        notes: order.notes ?? undefined,
        items: items.map((item): OrderItemResponse => ({
            id: String(item.id),
            product_id: String(item.product_id),
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

export const ordersHandlers = {

    list: async (c: Context) => {
        const { sub, role: userRole } = getAuthUser(c);
        const isAdmin = userRole === role.ADMIN || userRole === role.MANAGER;

        const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
        const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '20', 10)));
        const statusFilter = c.req.query('status') ?? null;

        const [orders, total] = isAdmin
            ? await Promise.all([
                ordersQueries.findAll(page, limit, statusFilter),
                ordersQueries.countAll(statusFilter),
              ])
            : await Promise.all([
                ordersQueries.findByUserId(Number(sub), page, limit, statusFilter),
                ordersQueries.countByUserId(Number(sub), statusFilter),
              ]);

        const responses = await Promise.all(
            orders.map(async (order) => {
                const items = await ordersQueries.findItemsByOrderId(order.id);
                return toOrderResponse(order, items);
            })
        );

        return paginated(c, responses, page, limit, total);
    },

    get: async (c: Context) => {
        const id = parseInt(c.req.param('id')!);
        const { sub, role: userRole } = getAuthUser(c);

        const order = await ordersQueries.findById(id);
        if (!order) throw new NotFoundError('Order', id);

        const isAdmin = userRole === role.ADMIN || userRole === role.MANAGER;
        if (!isAdmin && String(order.user_id) !== sub) throw new ForbiddenError();

        const items = await ordersQueries.findItemsByOrderId(id);
        return success(c, toOrderResponse(order, items));
    },

    create: async (c: Context) => {
        const { sub } = getAuthUser(c);
        const body = await c.req.json();
        const validated = createOrderSchema.safeParse(body);

        if (!validated.success) {
            throw new ValidationError('Invalid order data', validated.error.errors);
        }

        const variantIds = validated.data.items.map((i) => i.variant_id);
        const variants = await sql<VariantRow[]>`
            SELECT id, product_id, sku, size, color, stock, price_override, is_active
            FROM product_variants WHERE id = ANY(${variantIds})
        `;

        const variantMap = new Map<number, VariantRow>(variants.map((v) => [v.id, v]));

        const productIds = [...new Set(variants.map((v) => v.product_id))];
        const products = await sql<ProductRow[]>`
            SELECT id, price, name, is_active FROM products WHERE id = ANY(${productIds})
        `;
        const productMap = new Map<number, ProductRow>(products.map((p) => [p.id, p]));

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
            const unitPrice = variant.price_override != null
                ? parseFloat(variant.price_override)
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

        const totalAmount = itemsWithPrice.reduce(
            (sum, item) => sum + item.unit_price * item.quantity,
            0
        );

        let order;
        try {
            order = await ordersQueries.create(
                Number(sub),
                itemsWithPrice,
                totalAmount,
                validated.data.shipping_address,
                validated.data.notes
            );
        } catch (err: any) {
            if (err.message?.includes('Insufficient stock') || err.message?.includes('not found')) {
                throw new BadRequestError(err.message);
            }
            throw new InternalServerError('Failed to create order');
        }

        const items = await ordersQueries.findItemsByOrderId(order.id);

        // Notify all admins/managers
        const adminIds = await notificationsQueries.findAdminIds();
        if (adminIds.length > 0) {
            const notifRows = adminIds.map((id) => ({
                recipient_id: id,
                type: 'NEW_ORDER',
                title: `New Order #${String(order.id).padStart(6, '0').toUpperCase()}`,
                body: `Order placed for KES ${totalAmount.toFixed(2)}`,
                data: { link: '/orders', order_id: String(order.id) },
            }));
            const created = await notificationsQueries.create(notifRows);
            pushToMany(adminIds, 'notification', { notifications: created });
        }

        return success(c, toOrderResponse(order, items), 'Order placed successfully', 201);
    },

    updateStatus: async (c: Context) => {
        const id = parseInt(c.req.param('id')!);
        const body = await c.req.json();
        const validated = updateOrderStatusSchema.safeParse(body);

        if (!validated.success) {
            throw new ValidationError('Invalid status', validated.error.errors);
        }

        const order = await ordersQueries.findById(id);
        if (!order) throw new NotFoundError('Order', id);

        const terminalStatuses = ['DELIVERED', 'REFUNDED'];
        if (terminalStatuses.includes(order.status)) {
            throw new BadRequestError(`Cannot update a ${order.status} order`);
        }

        if (validated.data.status === 'CANCELLED' && order.status !== 'CANCELLED') {
            await ordersQueries.restoreStock(id);
        }

        const updated = await ordersQueries.updateStatus(id, validated.data.status);
        if (!updated) throw new InternalServerError('Failed to update order status');

        const items = await ordersQueries.findItemsByOrderId(id);
        return success(c, toOrderResponse(updated, items), 'Order status updated');
    },

    stats: async (c: Context) => {
        const data = await ordersQueries.getStats();
        return success(c, data);
    },

    cancel: async (c: Context) => {
        const id = parseInt(c.req.param('id')!);
        const { sub } = getAuthUser(c);

        const order = await ordersQueries.findById(id);
        if (!order) throw new NotFoundError('Order', id);
        if (String(order.user_id) !== sub) throw new ForbiddenError();
        if (order.status !== 'PENDING') {
            throw new BadRequestError('Only PENDING orders can be cancelled');
        }

        await ordersQueries.restoreStock(id);
        const updated = await ordersQueries.updateStatus(id, 'CANCELLED');
        if (!updated) throw new InternalServerError('Failed to cancel order');

        const items = await ordersQueries.findItemsByOrderId(id);
        return success(c, toOrderResponse(updated, items), 'Order cancelled');
    },
};
