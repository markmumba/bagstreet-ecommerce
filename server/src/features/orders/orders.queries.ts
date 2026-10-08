import { sql } from '../../lib/db';
import { toJsonbParam } from '../../lib/json-column';
import { adjustStock } from '../../lib/inventory';
import { ORDER_SOURCE, ORDER_STATUS, PAYMENT_STATUS } from 'shared/dist';
import type { Order, OrderSource, OrderStatus, PaymentStatus, ShippingAddress } from 'shared/dist';
import { randomBytes } from 'node:crypto';
import { BadRequestError, TooManyRequestsError } from '../../lib/errors';
import { orderLimitViolation, type CustomerOrderCounts } from './order-limits';

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

/**
 * Serialises checkouts for the same phone/email (transaction-scoped advisory locks, always taken in
 * the same order) and rejects the order if the customer is over their limits. Running inside the
 * order transaction means simultaneous requests can't all slip past the count.
 */
async function enforceCustomerOrderLimits(tx: typeof sql, phone: string, email: string | null) {
    const normalisedEmail = email?.trim().toLowerCase() || null;
    await tx`SELECT pg_advisory_xact_lock(hashtext(${'order-limit:phone:' + phone}))`;
    if (normalisedEmail) {
        await tx`SELECT pg_advisory_xact_lock(hashtext(${'order-limit:email:' + normalisedEmail}))`;
    }

    const [counts] = await tx<CustomerOrderCounts[]>`
        SELECT
            count(*) FILTER (
                WHERE status = ${ORDER_STATUS.PENDING} AND payment_status <> ${PAYMENT_STATUS.PAID}
            )::int AS "openUnpaid",
            count(*) FILTER (WHERE created_at > now() - interval '1 hour')::int AS "lastHour"
        FROM orders
        WHERE order_source = ${ORDER_SOURCE.ONLINE}
          AND (customer_phone = ${phone} OR (${normalisedEmail}::text IS NOT NULL AND lower(customer_email) = ${normalisedEmail}))
    `;
    const violation = orderLimitViolation(counts ?? { openUnpaid: 0, lastHour: 0 });
    if (violation) throw new TooManyRequestsError(violation);
}

/**
 * Claims one use of a discount code for an order. Runs inside the order transaction and locks the
 * code row, so concurrent checkouts can't exceed `usage_limit` or reuse a code for the same phone.
 */
async function recordDiscountUsage(
    tx: typeof sql,
    orderId: number,
    usage: { codeId: number; phone: string; amount: number },
) {
    const [code] = await tx<{ id: number; is_active: boolean; usage_limit: number | null; used_count: number }[]>`
        SELECT id, is_active, usage_limit, used_count FROM discount_codes WHERE id = ${usage.codeId} FOR UPDATE
    `;
    if (!code || !code.is_active) throw new BadRequestError('Discount code is not active');
    if (code.usage_limit != null && code.used_count >= code.usage_limit) {
        throw new BadRequestError('Discount code usage limit has been reached');
    }

    const [alreadyUsed] = await tx`
        SELECT 1 FROM discount_code_usages WHERE code_id = ${usage.codeId} AND phone = ${usage.phone} LIMIT 1
    `;
    if (alreadyUsed) throw new BadRequestError('This phone number has already used this code');

    await tx`
        INSERT INTO discount_code_usages (code_id, order_id, phone, discount_amount)
        VALUES (${usage.codeId}, ${orderId}, ${usage.phone}, ${usage.amount})
    `;
    await tx`UPDATE discount_codes SET used_count = used_count + 1 WHERE id = ${usage.codeId}`;
}

/** Gives back the discount use held by a cancelled order so the customer can use the code again. */
async function releaseDiscountUsage(tx: typeof sql, orderId: number) {
    const released = await tx<{ code_id: number }[]>`
        DELETE FROM discount_code_usages WHERE order_id = ${orderId} RETURNING code_id
    `;
    for (const row of released) {
        await tx`UPDATE discount_codes SET used_count = GREATEST(used_count - 1, 0) WHERE id = ${row.code_id}`;
    }
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
            /** Recorded in the same transaction as the order, so a failed code check never leaves an orphan order. */
            discountUsage?: { codeId: number; phone: string; amount: number };
            /** Online checkout only: enforce per-customer order limits (see order-limits.ts). */
            customerLimits?: { phone: string; email: string | null };
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
            if (options?.customerLimits) {
                await enforceCustomerOrderLimits(tx, options.customerLimits.phone, options.customerLimits.email);
            }
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
                    ${userId}, ${orderNumber}, ${totalAmount}, ${toJsonbParam(shippingAddress)}::jsonb,
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

            if (options?.discountUsage) {
                await recordDiscountUsage(tx, order.id, options.discountUsage);
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
                        ${toJsonbParam(options.payment.rawPayload)}::jsonb
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
                        ${toJsonbParam(options.payment.metadata)}::jsonb
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

    /** Online orders still unpaid after the payment window. */
    findExpiredUnpaid: async (createdBefore: Date, limit = 50): Promise<{ id: number; created_at: string }[]> => {
        return await sql<{ id: number; created_at: string }[]>`
            SELECT id, created_at FROM orders
            WHERE status = ${ORDER_STATUS.PENDING}
              AND payment_status IN (${PAYMENT_STATUS.UNPAID}, ${PAYMENT_STATUS.FAILED})
              AND order_source = ${ORDER_SOURCE.ONLINE}
              AND created_at < ${createdBefore.toISOString()}
              -- Money already received (e.g. underpaid, held for review): staff resolve it, not the timer.
              AND NOT EXISTS (
                  SELECT 1 FROM payment_ledger_entries ple
                  WHERE ple.order_id = orders.id AND ple.entry_type = 'PAYMENT_CAPTURED'
              )
            ORDER BY created_at ASC
            LIMIT ${limit}
        `;
    },

    /**
     * Cancels an unpaid order and releases its stock and discount use in one transaction.
     * The conditional UPDATE means only one caller (job, admin, customer) can win; returns false
     * if the order was paid or changed in the meantime.
     */
    cancelUnpaid: async (orderId: number): Promise<boolean> => {
        return await sql.begin(async (tx: typeof sql) => {
            const [cancelled] = await tx<{ id: number }[]>`
                UPDATE orders SET status = ${ORDER_STATUS.CANCELLED}, updated_at = CURRENT_TIMESTAMP
                WHERE id = ${orderId}
                  AND status = ${ORDER_STATUS.PENDING}
                  AND payment_status <> ${PAYMENT_STATUS.PAID}
                RETURNING id
            `;
            if (!cancelled) return false;

            const orderItems = await tx<{ variant_id: number; quantity: number }[]>`
                SELECT variant_id, quantity FROM order_items
                WHERE order_id = ${orderId} AND variant_id IS NOT NULL
            `;
            for (const item of orderItems) {
                await adjustStock(tx, item.variant_id, item.quantity, 'ORDER_CANCELLED', orderId, 'Unpaid order expired', null);
            }
            await releaseDiscountUsage(tx, orderId);
            return true;
        }) as unknown as Promise<boolean>;
    },

    /**
     * A payment arrived for an order that had already expired. Re-takes its stock if every item is
     * still available and puts it back to PENDING (the caller then marks it paid). Returns false —
     * changing nothing — when stock has run out, so staff can refund instead of overselling.
     */
    reinstateCancelled: async (orderId: number): Promise<boolean> => {
        return await sql.begin(async (tx: typeof sql) => {
            const [order] = await tx<{ id: number }[]>`
                SELECT id FROM orders WHERE id = ${orderId} AND status = ${ORDER_STATUS.CANCELLED} FOR UPDATE
            `;
            if (!order) return false;

            const orderItems = await tx<{ variant_id: number; quantity: number }[]>`
                SELECT variant_id, quantity FROM order_items
                WHERE order_id = ${orderId} AND variant_id IS NOT NULL
            `;
            for (const item of orderItems) {
                const [variant] = await tx<{ stock: number }[]>`
                    SELECT stock FROM product_variants WHERE id = ${item.variant_id} FOR UPDATE
                `;
                if (!variant || variant.stock < item.quantity) return false;
            }
            for (const item of orderItems) {
                await adjustStock(tx, item.variant_id, -item.quantity, 'ORDER_PLACED', orderId, 'Reinstated after late payment', null);
            }
            await tx`UPDATE orders SET status = ${ORDER_STATUS.PENDING}, updated_at = CURRENT_TIMESTAMP WHERE id = ${orderId}`;
            return true;
        }) as unknown as Promise<boolean>;
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
