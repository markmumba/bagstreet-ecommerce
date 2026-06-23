import { sql } from '../../lib/db';
import type { Order, OrderStatus, ShippingAddress } from 'shared/dist';

interface OrderRow extends Omit<Order, 'id' | 'created_at' | 'updated_at'> {
    id: number;
    created_at: string;
    updated_at: string;
}

interface OrderItemRow {
    id: number;
    order_id: number;
    product_id: number;
    product_name: string;
    variant_id: number | null;
    variant_sku: string | null;
    variant_size: string | null;
    variant_color: string | null;
    quantity: number;
    unit_price: string;
    subtotal: string;
    created_at: string;
}

export const ordersQueries = {
    findAll: async (page: number, limit: number, status: string | null): Promise<OrderRow[]> => {
        const offset = (page - 1) * limit;
        return await sql<OrderRow[]>`
            SELECT * FROM orders
            WHERE (${status} IS NULL OR status = ${status})
            ORDER BY created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `;
    },

    countAll: async (status: string | null): Promise<number> => {
        const [result] = await sql<[{ count: string }]>`
            SELECT COUNT(*) as count FROM orders
            WHERE (${status} IS NULL OR status = ${status})
        `;
        return parseInt(result.count, 10);
    },

    findByUserId: async (userId: number, page: number, limit: number, status: string | null): Promise<OrderRow[]> => {
        const offset = (page - 1) * limit;
        return await sql<OrderRow[]>`
            SELECT * FROM orders
            WHERE user_id = ${userId}
              AND (${status} IS NULL OR status = ${status})
            ORDER BY created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `;
    },

    countByUserId: async (userId: number, status: string | null): Promise<number> => {
        const [result] = await sql<[{ count: string }]>`
            SELECT COUNT(*) as count FROM orders
            WHERE user_id = ${userId}
              AND (${status} IS NULL OR status = ${status})
        `;
        return parseInt(result.count, 10);
    },

    findById: async (id: number): Promise<OrderRow | undefined> => {
        const [order] = await sql<OrderRow[]>`SELECT * FROM orders WHERE id = ${id}`;
        return order;
    },

    findItemsByOrderId: async (orderId: number): Promise<OrderItemRow[]> => {
        return await sql<OrderItemRow[]>`
            SELECT oi.*, p.name AS product_name
            FROM order_items oi
            JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = ${orderId}
        `;
    },

    create: async (
        userId: number,
        items: {
            variant_id: number;
            product_id: number;
            quantity: number;
            unit_price: number;
            variant_sku: string;
            variant_size: string | null;
            variant_color: string | null;
        }[],
        totalAmount: number,
        shippingAddress: ShippingAddress,
        notes?: string
    ): Promise<OrderRow> => {
        return await sql.begin(async (tx: typeof sql) => {
            for (const item of items) {
                const [variant] = await tx<{ id: number; stock: number; size: string | null; color: string | null }[]>`
                    SELECT id, stock, size, color FROM product_variants WHERE id = ${item.variant_id} FOR UPDATE
                `;
                if (!variant) throw new Error(`Variant ${item.variant_id} not found`);
                if (variant.stock < item.quantity) {
                    throw new Error(
                        `Insufficient stock for variant (size: ${variant.size ?? 'N/A'}, color: ${variant.color ?? 'N/A'}) (available: ${variant.stock})`
                    );
                }
            }

            const [order] = await tx<OrderRow[]>`
                INSERT INTO orders(user_id, total_amount, shipping_address, notes)
                VALUES (${userId}, ${totalAmount}, ${JSON.stringify(shippingAddress)}::jsonb, ${notes ?? null})
                RETURNING *
            `;

            if (!order) throw new Error('Failed to create order');

            for (const item of items) {
                const subtotal = item.unit_price * item.quantity;
                await tx`
                    INSERT INTO order_items(order_id, product_id, variant_id, variant_sku, variant_size, variant_color, quantity, unit_price, subtotal)
                    VALUES (
                        ${order.id}, ${item.product_id}, ${item.variant_id},
                        ${item.variant_sku}, ${item.variant_size ?? null}, ${item.variant_color ?? null},
                        ${item.quantity}, ${item.unit_price}, ${subtotal}
                    )
                `;
                await tx`
                    UPDATE product_variants SET stock = stock - ${item.quantity} WHERE id = ${item.variant_id}
                `;
            }

            return order!;
        }) as unknown as Promise<OrderRow>;
    },

    updateStatus: async (id: number, status: OrderStatus): Promise<OrderRow | undefined> => {
        const [order] = await sql<OrderRow[]>`
            UPDATE orders SET status = ${status} WHERE id = ${id} RETURNING *
        `;
        return order;
    },

    restoreStock: async (orderId: number): Promise<void> => {
        await sql`
            UPDATE product_variants pv
            SET stock = pv.stock + oi.quantity
            FROM order_items oi
            WHERE oi.order_id = ${orderId} AND pv.id = oi.variant_id
        `;
    },
};
