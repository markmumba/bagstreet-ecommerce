import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Boxes,
  CheckCircle2,
  CreditCard,
  PackageCheck,
  RefreshCw,
  ShoppingBag,
  WalletCards,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/services/api';
import { ORDER_STATUS, PAYMENT_STATUS } from 'shared';
import { RevenueChart } from '@/components/dashboard/RevenueChart';
import { OrderStatusChart } from '@/components/dashboard/OrderStatusChart';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
});

interface DashboardOrderItem {
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

interface DashboardStockRisk {
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

interface DashboardTopProduct {
  product_id: string;
  product_name: string;
  image_url?: string;
  units_sold: number;
  revenue: number;
}

interface DashboardOverview {
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

const currencyFormatter = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('en-KE');
const dateTimeFormatter = new Intl.DateTimeFormat('en-KE', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

function formatAge(value?: string) {
  if (!value) return 'Just now';
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return 'Recently';

  const diffMs = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function statusLabel(status: string) {
  if (status === ORDER_STATUS.DELIVERED) return 'Received';
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function statusVariant(status: string): React.ComponentProps<typeof Badge>['variant'] {
  if (status === ORDER_STATUS.PENDING) return 'warning';
  if (status === ORDER_STATUS.DELIVERED) return 'success';
  if (status === ORDER_STATUS.CANCELLED) return 'danger';
  if (status === ORDER_STATUS.REFUNDED) return 'neutral';
  return 'info';
}

function paymentVariant(status: string): React.ComponentProps<typeof Badge>['variant'] {
  if (status === PAYMENT_STATUS.PAID) return 'success';
  if (status === PAYMENT_STATUS.FAILED) return 'danger';
  return 'warning';
}

function variantLabel(item: DashboardStockRisk) {
  return [item.size, item.color].filter(Boolean).join(' / ') || 'Default variant';
}

function KpiCard({
  title,
  value,
  detail,
  icon: Icon,
  tone = 'neutral',
  isLoading,
}: {
  title: string;
  value: string | number;
  detail: string;
  icon: React.ElementType;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
  isLoading?: boolean;
}) {
  const toneClass = {
    neutral: 'bg-[var(--color-neutral-bg)] text-[var(--color-neutral-text)]',
    success: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]',
    warning: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]',
    danger: 'bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]',
  }[tone];

  return (
    <Card className="gap-3">
      <CardHeader className="flex flex-row items-center justify-between pb-0">
        <CardTitle className="table-header">{title}</CardTitle>
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', toneClass)}>
          <Icon className="h-4 w-4" strokeWidth={1.7} />
        </span>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <div className="skeleton h-8 w-28" />
            <div className="skeleton h-3 w-36" />
          </div>
        ) : (
          <>
            <div className="kpi-value tabular-nums">{value}</div>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function OrderQueueCard({
  title,
  description,
  items,
  emptyMessage,
}: {
  title: string;
  description: string;
  items: DashboardOrderItem[];
  emptyMessage: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/orders">
              View All
              <ArrowRight className="h-4 w-4" strokeWidth={1.7} />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState message={emptyMessage} />
        ) : (
          <div className="divide-y divide-border">
            {items.map((order) => (
              <div key={order.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-medium">{order.order_number ?? `#${order.id.padStart(6, '0')}`}</p>
                    <Badge variant={statusVariant(order.status)}>{statusLabel(order.status)}</Badge>
                    <Badge variant={paymentVariant(order.payment_status)}>
                      {order.payment_status.toLowerCase()}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {order.customer_name} - {order.unit_count} unit{order.unit_count === 1 ? '' : 's'} - {formatAge(order.paid_at ?? order.created_at)}
                  </p>
                </div>
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-semibold tabular-nums">{formatCurrency(order.total_amount)}</p>
                  <p className="text-xs text-muted-foreground">{order.item_count} line{order.item_count === 1 ? '' : 's'}</p>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/orders" search={{ order_id: order.id }}>
                    View
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StockRiskCard({ risks }: { risks: DashboardStockRisk[] }) {
  return (
    <Card>
      <CardHeader className="pb-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Stock Risks</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Variants that can block future sales.</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/products">
              Products
              <ArrowRight className="h-4 w-4" strokeWidth={1.7} />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {risks.length === 0 ? (
          <EmptyState message="Stock is healthy across active variants." />
        ) : (
          <div className="divide-y divide-border">
            {risks.map((risk) => (
              <div key={risk.variant_id} className="flex items-center gap-3 py-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                  {risk.image_url ? (
                    <img
                      src={risk.image_url}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ShoppingBag className="h-4 w-4 text-muted-foreground" strokeWidth={1.7} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-medium">{risk.product_name}</p>
                    <Badge variant={risk.severity === 'out' ? 'danger' : 'warning'}>
                      {risk.severity === 'out' ? 'Out' : 'Low'}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {variantLabel(risk)} - {risk.sku}
                  </p>
                </div>
                <div className="text-right">
                  <p className={cn(
                    'text-sm font-semibold tabular-nums',
                    risk.severity === 'out' ? 'text-[var(--color-danger-text)]' : 'text-[var(--color-warning-text)]'
                  )}>
                    {risk.stock}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">min {risk.low_stock_threshold}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TopProductsCard({ products }: { products: DashboardTopProduct[] }) {
  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-base">Top Sellers</CardTitle>
        <p className="text-sm text-muted-foreground">Paid order volume from the last 30 days.</p>
      </CardHeader>
      <CardContent>
        {products.length === 0 ? (
          <EmptyState message="No paid product sales in the last 30 days." />
        ) : (
          <div className="divide-y divide-border">
            {products.map((product, index) => (
              <div key={product.product_id} className="flex items-center gap-3 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-neutral-bg)] text-xs font-semibold text-[var(--color-neutral-text)] tabular-nums">
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{product.product_name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {numberFormatter.format(product.units_sold)} unit{product.units_sold === 1 ? '' : 's'} sold
                  </p>
                </div>
                <p className="text-right text-sm font-semibold tabular-nums">
                  {formatCurrency(product.revenue)}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OperationsBrief({ overview }: { overview: DashboardOverview }) {
  const paymentAttention = overview.summary.unpaid_pending_orders + overview.summary.failed_payment_orders;
  const stockRisk = overview.summary.low_stock_variants + overview.summary.out_of_stock_variants;
  const totalActions = overview.summary.orders_to_fulfill + paymentAttention + stockRisk;

  const rows = [
    {
      label: 'Fulfill paid orders',
      value: overview.summary.orders_to_fulfill,
      icon: PackageCheck,
      href: '/orders' as const,
      tone: overview.summary.orders_to_fulfill > 0 ? 'info' : 'neutral',
    },
    {
      label: 'Follow up payments',
      value: paymentAttention,
      icon: CreditCard,
      href: '/orders' as const,
      tone: paymentAttention > 0 ? 'warning' : 'neutral',
    },
    {
      label: 'Fix stock risks',
      value: stockRisk,
      icon: Boxes,
      href: '/products' as const,
      tone: overview.summary.out_of_stock_variants > 0 ? 'danger' : stockRisk > 0 ? 'warning' : 'neutral',
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-base">Needs Attention</CardTitle>
        <p className="text-sm text-muted-foreground">
          {totalActions === 0 ? 'No urgent operational work right now.' : `${numberFormatter.format(totalActions)} item${totalActions === 1 ? '' : 's'} to review.`}
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {rows.map((row) => (
            <Link
              key={row.label}
              to={row.href}
              className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20"
            >
              <row.icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.7} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.label}</span>
              <Badge variant={row.tone as React.ComponentProps<typeof Badge>['variant']}>
                {numberFormatter.format(row.value)}
              </Badge>
            </Link>
          ))}
        </div>
        <div className="mt-4 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          Last refreshed {dateTimeFormatter.format(new Date(overview.generated_at))}
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-6">
        <div className="space-y-2">
          <div className="skeleton h-8 w-64" />
          <div className="skeleton h-4 w-80" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Card key={index}>
              <CardContent>
                <div className="skeleton h-8 w-24" />
                <div className="mt-2 skeleton h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}

function DashboardPage() {
  const dashboardQuery = useQuery({
    queryKey: ['dashboard', 'overview'],
    queryFn: () => apiClient.get<DashboardOverview>('/api/dashboard/overview'),
    refetchInterval: 60_000,
  });

  const overview = dashboardQuery.data?.data;

  if (dashboardQuery.isLoading) return <DashboardSkeleton />;

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold leading-tight text-pretty">Merchant Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Revenue, fulfillment work, payment follow-up, and stock risk in one place.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => dashboardQuery.refetch()}
            disabled={dashboardQuery.isFetching}
            aria-label="Refresh dashboard"
          >
            <RefreshCw className={cn('h-4 w-4', dashboardQuery.isFetching && 'animate-spin')} strokeWidth={1.7} />
            Refresh
          </Button>
        </div>

        {dashboardQuery.isError || !overview ? (
          <Card>
            <CardContent>
              <div className="rounded-lg border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger-text)]">
                Dashboard data could not be loaded. Refresh the page or sign in again.
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <KpiCard
                title="Paid Today"
                value={formatCurrency(overview.summary.paid_revenue_today)}
                detail={`${numberFormatter.format(overview.summary.paid_orders_today)} paid order${overview.summary.paid_orders_today === 1 ? '' : 's'}`}
                icon={Banknote}
                tone="success"
              />
              <KpiCard
                title="Paid Last 7 Days"
                value={formatCurrency(overview.summary.paid_revenue_7d)}
                detail={`${formatCurrency(overview.summary.paid_revenue_30d)} in 30 days`}
                icon={WalletCards}
                tone="neutral"
              />
              <KpiCard
                title="To Fulfill"
                value={numberFormatter.format(overview.summary.orders_to_fulfill)}
                detail="Paid orders not received"
                icon={PackageCheck}
                tone={overview.summary.orders_to_fulfill > 0 ? 'warning' : 'success'}
              />
              <KpiCard
                title="Payment Follow-up"
                value={numberFormatter.format(overview.summary.unpaid_pending_orders + overview.summary.failed_payment_orders)}
                detail={`${overview.summary.failed_payment_orders} failed, ${overview.summary.unpaid_pending_orders} unpaid`}
                icon={CreditCard}
                tone={overview.summary.failed_payment_orders > 0 ? 'danger' : overview.summary.unpaid_pending_orders > 0 ? 'warning' : 'success'}
              />
              <KpiCard
                title="Stock Risk"
                value={numberFormatter.format(overview.summary.low_stock_variants + overview.summary.out_of_stock_variants)}
                detail={`${overview.summary.out_of_stock_variants} out, ${overview.summary.low_stock_variants} low`}
                icon={AlertTriangle}
                tone={overview.summary.out_of_stock_variants > 0 ? 'danger' : overview.summary.low_stock_variants > 0 ? 'warning' : 'success'}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(340px,1fr)]">
              <RevenueChart data={overview.revenue_trend} />
              <OperationsBrief overview={overview} />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)]">
              <OrderQueueCard
                title="Fulfillment Queue"
                description="Oldest paid orders that still need manual progress."
                items={overview.fulfillment_queue}
                emptyMessage="No paid orders are waiting for fulfillment."
              />
              <OrderStatusChart data={overview.status_counts} />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <OrderQueueCard
                title="Payment Follow-up"
                description="Pending checkout and failed payment orders to review."
                items={overview.payment_issues}
                emptyMessage="No payment follow-up needed."
              />
              <StockRiskCard risks={overview.stock_risks} />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <TopProductsCard products={overview.top_products} />
              <Card>
                <CardHeader className="pb-0">
                  <CardTitle className="text-base">Catalog Health</CardTitle>
                  <p className="text-sm text-muted-foreground">A quick read on sellable products and inventory exposure.</p>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-border px-4 py-3">
                      <p className="text-xs text-muted-foreground">Active Products</p>
                      <p className="mt-1 text-xl font-semibold tabular-nums">{numberFormatter.format(overview.summary.active_products)}</p>
                    </div>
                    <div className="rounded-lg border border-border px-4 py-3">
                      <p className="text-xs text-muted-foreground">Low Stock</p>
                      <p className="mt-1 text-xl font-semibold text-[var(--color-warning-text)] tabular-nums">{numberFormatter.format(overview.summary.low_stock_variants)}</p>
                    </div>
                    <div className="rounded-lg border border-border px-4 py-3">
                      <p className="text-xs text-muted-foreground">Out Of Stock</p>
                      <p className="mt-1 text-xl font-semibold text-[var(--color-danger-text)] tabular-nums">{numberFormatter.format(overview.summary.out_of_stock_variants)}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2 rounded-lg bg-[var(--color-info-bg)] px-3 py-2 text-sm text-[var(--color-info-text)]">
                    <CheckCircle2 className="h-4 w-4" strokeWidth={1.7} />
                    <span>
                      Revenue cards count paid orders only, so abandoned or failed checkouts do not inflate sales.
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
