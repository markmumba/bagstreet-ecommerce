import { sql } from '../../lib/db';
import { adjustStock } from '../../lib/inventory';
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
            WHERE (${status}::text IS NULL OR status = ${status}::text)
            ORDER BY created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `;
    },

    countAll: async (status: string | null): Promise<number> => {
        const [result] = await sql<[{ count: string }]>`
            SELECT COUNT(*) as count FROM orders
            WHERE (${status}::text IS NULL OR status = ${status}::text)
        `;
        return parseInt(result.count, 10);
    },

    findByUserId: async (userId: number, page: number, limit: number, status: string | null): Promise<OrderRow[]> => {
        const offset = (page - 1) * limit;
        return await sql<OrderRow[]>`
            SELECT * FROM orders
            WHERE user_id = ${userId}
              AND (${status}::text IS NULL OR status = ${status}::text)
            ORDER BY created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `;
    },

    countByUserId: async (userId: number, status: string | null): Promise<number> => {
        const [result] = await sql<[{ count: string }]>`
            SELECT COUNT(*) as count FROM orders
            WHERE user_id = ${userId}
              AND (${status}::text IS NULL OR status = ${status}::text)
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
        shippingLocationId: number,
        shippingCost: number,
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
                INSERT INTO orders(user_id, total_amount, shipping_address, shipping_location_id, shipping_cost, notes)
                VALUES (${userId}, ${totalAmount}, ${JSON.stringify(shippingAddress)}::jsonb, ${shippingLocationId}, ${shippingCost}, ${notes ?? null})
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
                await adjustStock(tx, item.variant_id, -item.quantity, 'ORDER_PLACED', order.id, null, userId);
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
        await sql.begin(async (tx: typeof sql) => {
            const orderItems = await tx<{ variant_id: number; quantity: number }[]>`
                SELECT variant_id, quantity FROM order_items
                WHERE order_id = ${orderId} AND variant_id IS NOT NULL
            `;
            for (const item of orderItems) {
                await adjustStock(tx, item.variant_id, item.quantity, 'ORDER_CANCELLED', orderId, null, null);
            }
        });
    },

    getStats: async (): Promise<{ dailyRevenue: { date: string; revenue: number }[]; statusCounts: { status: string; count: number }[] }> => {
        const daily = await sql<{ date: string; revenue: string }[]>`
            SELECT
                TO_CHAR(created_at::date, 'YYYY-MM-DD') AS date,
                COALESCE(SUM(total_amount), 0) AS revenue
            FROM orders
            WHERE status NOT IN ('CANCELLED', 'REFUNDED')
              AND created_at >= NOW() - INTERVAL '30 days'
            GROUP BY created_at::date
            ORDER BY created_at::date ASC
        `;

        const statusRows = await sql<{ status: string; count: string }[]>`
            SELECT status, COUNT(*) AS count FROM orders GROUP BY status
        `;

        return {
            dailyRevenue: daily.map((r) => ({ date: r.date, revenue: parseFloat(r.revenue) })),
            statusCounts: statusRows.map((r) => ({ status: r.status, count: parseInt(r.count, 10) })),
        };
    },
};
