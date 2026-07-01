import { sql } from '../../lib/db';
import { adjustStock } from '../../lib/inventory';
import { ORDER_SOURCE, ORDER_STATUS, PAYMENT_STATUS } from 'shared/dist';
import type { Order, OrderSource, OrderStatus, PaymentStatus, ShippingAddress } from 'shared/dist';
import { randomBytes } from 'node:crypto';

interface OrderRow extends Omit<Order, 'id' | 'created_at' | 'updated_at'> {
    id: number;
    public_id: string;
    order_number: string;
    user_id: number | null;
    order_source: OrderSource;
    payment_status: PaymentStatus;
    created_at: string;
    updated_at: string;
}

interface OrderItemRow {
    id: number;
    order_id: number;
    product_id: number;
    product_slug: string | null;
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

function generateOrderNumber() {
    return `BS-${randomBytes(4).toString('hex').toUpperCase()}`;
}

async function uniqueOrderNumber(tx: typeof sql): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidate = generateOrderNumber();
        const [existing] = await tx<{ id: number }[]>`
            SELECT id FROM orders WHERE order_number = ${candidate} LIMIT 1
        `;
        if (!existing) return candidate;
    }
    throw new Error('Failed to generate unique order number');
}

export const ordersQueries = {
    findAll: async (page: number, limit: number, status: string | null, paymentStatus: string | null): Promise<OrderRow[]> => {
        const offset = (page - 1) * limit;
        return await sql<OrderRow[]>`
            SELECT * FROM orders
            WHERE (${status}::text IS NULL OR status = ${status}::text)
              AND (${paymentStatus}::text IS NULL OR payment_status = ${paymentStatus}::text)
            ORDER BY created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `;
    },

    countAll: async (status: string | null, paymentStatus: string | null): Promise<number> => {
        const [result] = await sql<[{ count: string }]>`
            SELECT COUNT(*) as count FROM orders
            WHERE (${status}::text IS NULL OR status = ${status}::text)
              AND (${paymentStatus}::text IS NULL OR payment_status = ${paymentStatus}::text)
        `;
        return parseInt(result.count, 10);
    },

    findByUserId: async (userId: number, page: number, limit: number, status: string | null, paymentStatus: string | null): Promise<OrderRow[]> => {
        const offset = (page - 1) * limit;
        return await sql<OrderRow[]>`
            SELECT * FROM orders
            WHERE user_id = ${userId}
              AND (${status}::text IS NULL OR status = ${status}::text)
              AND (${paymentStatus}::text IS NULL OR payment_status = ${paymentStatus}::text)
            ORDER BY created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `;
    },

    countByUserId: async (userId: number, status: string | null, paymentStatus: string | null): Promise<number> => {
        const [result] = await sql<[{ count: string }]>`
            SELECT COUNT(*) as count FROM orders
            WHERE user_id = ${userId}
              AND (${status}::text IS NULL OR status = ${status}::text)
              AND (${paymentStatus}::text IS NULL OR payment_status = ${paymentStatus}::text)
        `;
        return parseInt(result.count, 10);
    },

    findById: async (id: number): Promise<OrderRow | undefined> => {
        const [order] = await sql<OrderRow[]>`SELECT * FROM orders WHERE id = ${id}`;
        return order;
    },

    findByReference: async (reference: string): Promise<OrderRow | undefined> => {
        const ref = reference.trim();
        if (/^\d+$/.test(ref)) {
            return ordersQueries.findById(Number(ref));
        }

        const [order] = await sql<OrderRow[]>`
            SELECT * FROM orders
            WHERE public_id::text = ${ref}
               OR order_number = ${ref.toUpperCase()}
            LIMIT 1
        `;
        return order;
    },

    findItemsByOrderId: async (orderId: number): Promise<OrderItemRow[]> => {
        return await sql<OrderItemRow[]>`
            SELECT oi.*, p.name AS product_name, p.slug AS product_slug
            FROM order_items oi
            JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = ${orderId}
        `;
    },
    findProductInOrders: async (productId:number):Promise<boolean> => {
        interface QueryResult {
            is_in_order: boolean;
        }

        const result = await sql<QueryResult[]>`
            SELECT EXISTS (
                SELECT 1
                FROM order_items
                WHERE product_id = ${productId}
            ) AS is_in_order;
        `;
        return result[0]?.is_in_order ?? false;
    },

    create: async (
        userId: number | null,
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
        shippingLocationId: number | null,
        shippingCost: number,
        notes: string | undefined,
        discountCode: string | null,
        discountAmount: number,
        customerName: string,
        customerPhone: string,
        customerEmail: string | null,
        options?: {
            status?: OrderStatus;
            paymentStatus?: PaymentStatus;
            orderSource?: OrderSource;
            paidAt?: Date | null;
            inventoryCreatedBy?: number | null;
            inventoryNote?: string | null;
            payment?: {
                provider: string;
                providerReference?: string | null;
                merchantReference: string;
                paymentMethod?: string | null;
                amount: number;
                currency: string;
                reference: string;
                metadata?: unknown;
                rawPayload?: unknown;
            };
        }
    ): Promise<OrderRow> => {
        return await sql.begin(async (tx: typeof sql) => {
            const orderNumber = await uniqueOrderNumber(tx);
            const quantityByVariant = new Map<number, number>();
            for (const item of items) {
                quantityByVariant.set(
                    item.variant_id,
                    (quantityByVariant.get(item.variant_id) ?? 0) + item.quantity
                );
            }

            for (const [variantId, quantity] of quantityByVariant) {
                const [variant] = await tx<{ id: number; stock: number; size: string | null; color: string | null }[]>`
                    SELECT id, stock, size, color FROM product_variants WHERE id = ${variantId} FOR UPDATE
                `;
                if (!variant) throw new Error(`Variant ${variantId} not found`);
                if (variant.stock < quantity) {
                    throw new Error(
                        `Insufficient stock for variant (size: ${variant.size ?? 'N/A'}, color: ${variant.color ?? 'N/A'}) (available: ${variant.stock})`
                    );
                }
            }

            const paymentStatus = options?.paymentStatus ?? PAYMENT_STATUS.UNPAID;
            const orderStatus = options?.status ?? ORDER_STATUS.PENDING;
            const orderSource = options?.orderSource ?? ORDER_SOURCE.ONLINE;
            const paidAt = options?.paidAt ?? null;

            const [order] = await tx<OrderRow[]>`
                INSERT INTO orders(
                    user_id, order_number, total_amount, shipping_address, shipping_location_id, shipping_cost,
                    notes, discount_code, discount_amount, customer_name, customer_phone, customer_email,
                    status, payment_status, order_source, paid_at
                )
                VALUES (
                    ${userId}, ${orderNumber}, ${totalAmount}, ${JSON.stringify(shippingAddress)}::jsonb,
                    ${shippingLocationId}, ${shippingCost}, ${notes ?? null},
                    ${discountCode}, ${discountAmount}, ${customerName}, ${customerPhone}, ${customerEmail},
                    ${orderStatus}, ${paymentStatus}, ${orderSource}, ${paidAt ? paidAt.toISOString() : null}
                )
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
                await adjustStock(
                    tx,
                    item.variant_id,
                    -item.quantity,
                    'ORDER_PLACED',
                    order.id,
                    options?.inventoryNote ?? null,
                    options?.inventoryCreatedBy ?? userId
                );
            }

            if (options?.payment) {
                const [paymentTransaction] = await tx<{ id: number }[]>`
                    INSERT INTO payment_transactions(
                        order_id,
                        provider,
                        provider_reference,
                        merchant_reference,
                        checkout_url,
                        amount,
                        currency,
                        status,
                        payment_method,
                        confirmation_code,
                        result_desc,
                        raw_payload
                    )
                    VALUES (
                        ${order.id},
                        ${options.payment.provider},
                        ${options.payment.providerReference ?? null},
                        ${options.payment.merchantReference},
                        ${null},
                        ${options.payment.amount},
                        ${options.payment.currency},
                        ${'COMPLETED'},
                        ${options.payment.paymentMethod ?? null},
                        ${options.payment.providerReference ?? options.payment.reference},
                        ${'Payment recorded at checkout counter'},
                        ${options.payment.rawPayload == null ? null : JSON.stringify(options.payment.rawPayload)}::jsonb
                    )
                    ON CONFLICT (provider, merchant_reference) DO UPDATE
                    SET
                        status = EXCLUDED.status,
                        payment_method = EXCLUDED.payment_method,
                        confirmation_code = EXCLUDED.confirmation_code,
                        raw_payload = EXCLUDED.raw_payload
                    RETURNING id
                `;

                await tx`
                    INSERT INTO payment_ledger_entries(
                        order_id,
                        payment_transaction_id,
                        entry_type,
                        direction,
                        amount,
                        currency,
                        reference,
                        metadata
                    )
                    VALUES (
                        ${order.id},
                        ${paymentTransaction?.id ?? null},
                        ${'PAYMENT_CAPTURED'},
                        ${'CREDIT'},
                        ${options.payment.amount},
                        ${options.payment.currency},
                        ${options.payment.reference},
                        ${options.payment.metadata == null ? null : JSON.stringify(options.payment.metadata)}::jsonb
                    )
                    ON CONFLICT (entry_type, reference) WHERE reference IS NOT NULL DO NOTHING
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
                COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END), 0) AS revenue
            FROM payment_ledger_entries
            WHERE entry_type IN ('PAYMENT_CAPTURED', 'REFUND_ISSUED')
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
