import { sql } from '@server/lib/db';
import { ORDER_STATUS, PAYMENT_STATUS } from 'shared/dist';

type Numeric = number | string | null | undefined;

export interface DashboardOverview {
    generated_at: string;
    summary: {
        paid_revenue_today: number;
        paid_revenue_7d: number;
        paid_revenue_30d: number;
        paid_orders_today: number;
        orders_to_fulfill: number;
        unpaid_pending_orders: number;
        failed_payment_orders: number;
        low_stock_variants: number;
        out_of_stock_variants: number;
        active_products: number;
    };
    revenue_trend: { date: string; revenue: number; orders: number }[];
    status_counts: { status: string; count: number }[];
    fulfillment_queue: DashboardOrderItem[];
    payment_issues: DashboardOrderItem[];
    stock_risks: DashboardStockRisk[];
    top_products: DashboardTopProduct[];
}

export interface DashboardOrderItem {
    id: string;
    order_number?: string;
    customer_name: string;
    customer_email?: string;
    customer_phone?: string;
    status: string;
    payment_status: string;
    total_amount: number;
    item_count: number;
    unit_count: number;
    created_at: string;
    paid_at?: string;
}

export interface DashboardStockRisk {
    variant_id: string;
    product_id: string;
    product_name: string;
    image_url?: string;
    sku: string;
    size?: string;
    color?: string;
    stock: number;
    low_stock_threshold: number;
    severity: 'out' | 'low';
}

export interface DashboardTopProduct {
    product_id: string;
    product_name: string;
    image_url?: string;
    units_sold: number;
    revenue: number;
}

function toNumber(value: Numeric): number {
    return Number.parseFloat(String(value ?? 0));
}

function toInt(value: Numeric): number {
    return Number.parseInt(String(value ?? 0), 10);
}

function toOrderItem(row: any): DashboardOrderItem {
    return {
        id: String(row.id),
        order_number: row.order_number ?? undefined,
        customer_name: row.customer_name ?? 'Guest customer',
        customer_email: row.customer_email ?? undefined,
        customer_phone: row.customer_phone ?? undefined,
        status: row.status,
        payment_status: row.payment_status,
        total_amount: toNumber(row.total_amount),
        item_count: toInt(row.item_count),
        unit_count: toInt(row.unit_count),
        created_at: row.created_at,
        paid_at: row.paid_at ?? undefined,
    };
}

export const dashboardQueries = {
    overview: async (): Promise<DashboardOverview> => {
        const [summary] = await sql<{
            paid_revenue_today: string;
            paid_revenue_7d: string;
            paid_revenue_30d: string;
            paid_orders_today: string;
            orders_to_fulfill: string;
            unpaid_pending_orders: string;
            failed_payment_orders: string;
        }[]>`
            SELECT
                (
                    SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END), 0)
                    FROM payment_ledger_entries
                    WHERE entry_type IN ('PAYMENT_CAPTURED', 'REFUND_ISSUED')
                      AND created_at >= CURRENT_DATE
                ) AS paid_revenue_today,
                (
                    SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END), 0)
                    FROM payment_ledger_entries
                    WHERE entry_type IN ('PAYMENT_CAPTURED', 'REFUND_ISSUED')
                      AND created_at >= NOW() - INTERVAL '7 days'
                ) AS paid_revenue_7d,
                (
                    SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END), 0)
                    FROM payment_ledger_entries
                    WHERE entry_type IN ('PAYMENT_CAPTURED', 'REFUND_ISSUED')
                      AND created_at >= NOW() - INTERVAL '30 days'
                ) AS paid_revenue_30d,
                COUNT(*) FILTER (
                    WHERE payment_status = ${PAYMENT_STATUS.PAID}
                      AND status NOT IN (${ORDER_STATUS.CANCELLED}, ${ORDER_STATUS.REFUNDED})
                      AND paid_at >= CURRENT_DATE
                ) AS paid_orders_today,
                COUNT(*) FILTER (
                    WHERE payment_status = ${PAYMENT_STATUS.PAID}
                      AND status IN (${ORDER_STATUS.CONFIRMED}, ${ORDER_STATUS.PROCESSING}, ${ORDER_STATUS.SHIPPED})
                ) AS orders_to_fulfill,
                COUNT(*) FILTER (
                    WHERE payment_status = ${PAYMENT_STATUS.UNPAID}
                      AND status = ${ORDER_STATUS.PENDING}
                ) AS unpaid_pending_orders,
                COUNT(*) FILTER (
                    WHERE payment_status = ${PAYMENT_STATUS.FAILED}
                      AND status NOT IN (${ORDER_STATUS.CANCELLED}, ${ORDER_STATUS.REFUNDED})
                ) AS failed_payment_orders
            FROM orders
        `;

        const [stockSummary] = await sql<{
            low_stock_variants: string;
            out_of_stock_variants: string;
        }[]>`
            SELECT
                COUNT(*) FILTER (WHERE pv.stock > 0 AND pv.stock <= pv.low_stock_threshold) AS low_stock_variants,
                COUNT(*) FILTER (WHERE pv.stock = 0) AS out_of_stock_variants
            FROM product_variants pv
            JOIN products p ON p.id = pv.product_id
            WHERE pv.is_active = true
              AND p.is_active = true
              AND pv.stock <= pv.low_stock_threshold
        `;

        const [productSummary] = await sql<{ active_products: string }[]>`
            SELECT COUNT(*) AS active_products
            FROM products
            WHERE is_active = true
        `;

        const revenueRows = await sql<{ date: string; revenue: string; orders: string }[]>`
            WITH days AS (
                SELECT generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, INTERVAL '1 day')::date AS day
            )
            SELECT
                TO_CHAR(days.day, 'YYYY-MM-DD') AS date,
                COALESCE(SUM(CASE WHEN ple.direction = 'CREDIT' THEN ple.amount ELSE -ple.amount END), 0) AS revenue,
                COUNT(DISTINCT CASE WHEN ple.entry_type = 'PAYMENT_CAPTURED' THEN ple.order_id END) AS orders
            FROM days
            LEFT JOIN payment_ledger_entries ple
              ON ple.created_at::date = days.day
             AND ple.entry_type IN ('PAYMENT_CAPTURED', 'REFUND_ISSUED')
            GROUP BY days.day
            ORDER BY days.day ASC
        `;

        const statusRows = await sql<{ status: string; count: string }[]>`
            SELECT status, COUNT(*) AS count
            FROM orders
            GROUP BY status
            ORDER BY status ASC
        `;

        const fulfillmentRows = await sql<any[]>`
            SELECT
                o.id,
                o.order_number,
                COALESCE(o.customer_name, (o.shipping_address->>'full_name'), 'Guest customer') AS customer_name,
                o.customer_email,
                o.customer_phone,
                o.status,
                o.payment_status,
                o.total_amount,
                o.created_at,
                o.paid_at,
                COUNT(oi.id) AS item_count,
                COALESCE(SUM(oi.quantity), 0) AS unit_count
            FROM orders o
            LEFT JOIN order_items oi ON oi.order_id = o.id
            WHERE o.payment_status = ${PAYMENT_STATUS.PAID}
              AND o.status IN (${ORDER_STATUS.CONFIRMED}, ${ORDER_STATUS.PROCESSING}, ${ORDER_STATUS.SHIPPED})
            GROUP BY o.id
            ORDER BY COALESCE(o.paid_at, o.created_at) ASC
            LIMIT 8
        `;

        const paymentIssueRows = await sql<any[]>`
            SELECT
                o.id,
                o.order_number,
                COALESCE(o.customer_name, (o.shipping_address->>'full_name'), 'Guest customer') AS customer_name,
                o.customer_email,
                o.customer_phone,
                o.status,
                o.payment_status,
                o.total_amount,
                o.created_at,
                o.paid_at,
                COUNT(oi.id) AS item_count,
                COALESCE(SUM(oi.quantity), 0) AS unit_count
            FROM orders o
            LEFT JOIN order_items oi ON oi.order_id = o.id
            WHERE o.status = ${ORDER_STATUS.PENDING}
              AND o.payment_status IN (${PAYMENT_STATUS.UNPAID}, ${PAYMENT_STATUS.FAILED})
            GROUP BY o.id
            ORDER BY o.created_at ASC
            LIMIT 8
        `;

        const stockRows = await sql<any[]>`
            SELECT
                pv.id AS variant_id,
                p.id AS product_id,
                p.name AS product_name,
                p.image_url,
                pv.sku,
                pv.size,
                pv.color,
                pv.stock,
                pv.low_stock_threshold,
                CASE WHEN pv.stock = 0 THEN 'out' ELSE 'low' END AS severity
            FROM product_variants pv
            JOIN products p ON p.id = pv.product_id
            WHERE pv.is_active = true
              AND p.is_active = true
              AND pv.stock <= pv.low_stock_threshold
            ORDER BY
                CASE WHEN pv.stock = 0 THEN 0 ELSE 1 END,
                pv.stock ASC,
                p.name ASC
            LIMIT 10
        `;

        const topProductRows = await sql<any[]>`
            SELECT
                p.id AS product_id,
                p.name AS product_name,
                p.image_url,
                COALESCE(SUM(oi.quantity), 0) AS units_sold,
                COALESCE(SUM(oi.subtotal), 0) AS revenue
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            JOIN products p ON p.id = oi.product_id
            WHERE o.payment_status = ${PAYMENT_STATUS.PAID}
              AND o.status NOT IN (${ORDER_STATUS.CANCELLED}, ${ORDER_STATUS.REFUNDED})
              AND o.paid_at >= NOW() - INTERVAL '30 days'
            GROUP BY p.id, p.name, p.image_url
            ORDER BY units_sold DESC, revenue DESC
            LIMIT 5
        `;

        return {
            generated_at: new Date().toISOString(),
            summary: {
                paid_revenue_today: toNumber(summary?.paid_revenue_today),
                paid_revenue_7d: toNumber(summary?.paid_revenue_7d),
                paid_revenue_30d: toNumber(summary?.paid_revenue_30d),
                paid_orders_today: toInt(summary?.paid_orders_today),
                orders_to_fulfill: toInt(summary?.orders_to_fulfill),
                unpaid_pending_orders: toInt(summary?.unpaid_pending_orders),
                failed_payment_orders: toInt(summary?.failed_payment_orders),
                low_stock_variants: toInt(stockSummary?.low_stock_variants),
                out_of_stock_variants: toInt(stockSummary?.out_of_stock_variants),
                active_products: toInt(productSummary?.active_products),
            },
            revenue_trend: revenueRows.map((row) => ({
                date: row.date,
                revenue: toNumber(row.revenue),
                orders: toInt(row.orders),
            })),
            status_counts: statusRows.map((row) => ({
                status: row.status,
                count: toInt(row.count),
            })),
            fulfillment_queue: fulfillmentRows.map(toOrderItem),
            payment_issues: paymentIssueRows.map(toOrderItem),
            stock_risks: stockRows.map((row) => ({
                variant_id: String(row.variant_id),
                product_id: String(row.product_id),
                product_name: row.product_name,
                image_url: row.image_url ?? undefined,
                sku: row.sku,
                size: row.size ?? undefined,
                color: row.color ?? undefined,
                stock: toInt(row.stock),
                low_stock_threshold: toInt(row.low_stock_threshold),
                severity: row.severity,
            })),
            top_products: topProductRows.map((row) => ({
                product_id: String(row.product_id),
                product_name: row.product_name,
                image_url: row.image_url ?? undefined,
                units_sold: toInt(row.units_sold),
                revenue: toNumber(row.revenue),
            })),
        };
    },
};
