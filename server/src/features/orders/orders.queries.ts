import { sql } from '../../lib/db';
import { recordDiscountUsage } from './discount-usage';
import { assertRecoveryCheckoutUnpaid, attachRecoveryOrder } from '../cart-recovery/recovery.queries';
import { toJsonbParam } from '../../lib/json-column';
import { inventory } from '../inventory/inventory';
import { AfterCommit } from '../../lib/after-commit';
import { ORDER_SOURCE, ORDER_STATUS, PAYMENT_STATUS, LEGAL_POLICIES } from 'shared/dist';
import type { Order, OrderSource, OrderStatus, PaymentStatus, ShippingAddress } from 'shared/dist';
import { randomBytes } from 'node:crypto';
import { TooManyRequestsError } from '../../lib/errors';
import { orderLimitViolation, type CustomerOrderCounts } from './order-limits';
import { enqueueEmail } from '../../services/email-outbox';
import type { OrderAgreementSnapshot } from '../compliance/order-agreement';

export interface OrderRow extends Omit<Order, 'id' | 'created_at' | 'updated_at'> {
    id: number;
    public_id: string;
    order_number: string;
    user_id: number | null;
    order_source: OrderSource;
    payment_status: PaymentStatus;
    created_at: string;
    updated_at: string;
}

export interface OrderItemRow {
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
            recoverySessionHash?: string;
            recoverySourceOrderId?: number;
            policyAcceptance?: { accepted: true; version: string };
            status?: OrderStatus;
            paymentStatus?: PaymentStatus;
            orderSource?: OrderSource;
            paidAt?: Date | null;
            inventoryCreatedBy?: number | null;
            inventoryNote?: string | null;
            /** Recorded in the same transaction as the order, so a failed code check never leaves an orphan order. */
            discountUsage?: { codeId: number; phone: string; amount: number; subtotal: number };
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
        const after = new AfterCommit();
        const created = await sql.begin(async (tx: typeof sql) => {
            // Serialise account erasure with checkout so an already-authenticated request cannot recreate account data.
            if (userId != null) {
                const [active] = await tx`SELECT id FROM users WHERE id = ${userId} AND is_active = true FOR UPDATE`;
                if (!active) throw new Error('Active customer account not found');
            }
            if (options?.recoverySourceOrderId) {
                await assertRecoveryCheckoutUnpaid(tx, options.recoverySourceOrderId);
            }
            if (options?.customerLimits) {
                await enforceCustomerOrderLimits(tx, options.customerLimits.phone, options.customerLimits.email);
            }
            const orderNumber = await uniqueOrderNumber(tx);
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
            // Stock is taken once the order row exists, so the movements reference it; a shortfall rolls everything back.
            await inventory.reserve(tx, items.map((item) => ({ variantId: item.variant_id, quantity: item.quantity })), {
                referenceId: Number(order.id),
                note: options?.inventoryNote ?? null,
                by: options?.inventoryCreatedBy ?? userId,
            }, after);
            if (options?.policyAcceptance) {
                const names = items.length ? await tx<{ id: number; name: string }[]>`SELECT id, name FROM products WHERE id IN ${tx(items.map(item => item.product_id))}` : [];
                const snapshot: OrderAgreementSnapshot = { policies: LEGAL_POLICIES, order: {
                    number: order.order_number, submitted_at: new Date(order.created_at).toISOString(), customer: customerName, email: customerEmail,
                    address: { ...shippingAddress }, notes: notes ?? null, total: totalAmount, shipping: shippingCost, discount: discountAmount,
                    items: items.map(item => ({ name: names.find(product => Number(product.id) === item.product_id)?.name ?? item.variant_sku,
                        sku: item.variant_sku, size: item.variant_size, color: item.variant_color, quantity: item.quantity, unit_price: item.unit_price })),
                } };
                await tx`INSERT INTO order_policy_acceptances(order_id, policy_version, policy_snapshot)
                    VALUES (${order.id}, ${options.policyAcceptance.version}, ${toJsonbParam(snapshot)}::jsonb)`;
                if (customerEmail) await enqueueEmail({ type: 'ORDER_AGREEMENT', to: customerEmail, orderId: Number(order.id) },
                    { tx, dedupeKey: `order-agreement:${order.id}` });
            }

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
            }

            if (options?.discountUsage) {
                await recordDiscountUsage(tx, order.id, options.discountUsage);
            }

            if (options?.recoverySessionHash && customerEmail) {
                await attachRecoveryOrder(tx, options.recoverySessionHash, customerEmail, Number(order.id));
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
        }) as unknown as OrderRow;
        after.run();
        return created;
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

    getStats: async (): Promise<{ dailyRevenue: { date: string; revenue: number }[]; statusCounts: { status: string; count: number }[] }> => {
        const daily = await sql<{ date: string; revenue: string }[]>`
            SELECT
                TO_CHAR(created_at::date, 'YYYY-MM-DD') AS date,
                COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END), 0) AS revenue
            FROM payment_ledger_entries
            WHERE entry_type IN ('PAYMENT_CAPTURED', 'REFUND_ISSUED', 'PAYMENT_REVERSED')
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
