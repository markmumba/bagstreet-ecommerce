import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { apiClient } from '@/services/api';
import { Tag, Package, ClipboardList, TrendingUp, AlertTriangle } from 'lucide-react';
import { ORDER_STATUS } from 'shared';
import type { Category, ProductResponse, OrderResponse } from 'shared';
import { RevenueChart } from '@/components/dashboard/RevenueChart';
import { OrderStatusChart } from '@/components/dashboard/OrderStatusChart';

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
});

function getOrderStatusVariant(status: string): React.ComponentProps<typeof Badge>['variant'] {
  if (status === ORDER_STATUS.PENDING) return 'warning';
  if (status === ORDER_STATUS.DELIVERED) return 'success';
  if (status === ORDER_STATUS.CANCELLED) return 'danger';
  if (status === ORDER_STATUS.REFUNDED) return 'neutral';
  return 'info';
}

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  isLoading,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  description: string;
  isLoading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-1">
        <CardTitle className="table-header">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-8 w-16" />
            <div className="skeleton h-3 w-28" />
          </div>
        ) : (
          <div className="kpi-value">{value}</div>
        )}
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function DashboardPage() {
  const { user } = useAuth();

  const { data: categoriesRes, isLoading: catsLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiClient.get<Category[]>('/api/categories'),
  });

  const { data: productsRes, isLoading: prodsLoading } = useQuery({
    queryKey: ['products', { page: 1, limit: 1 }],
    queryFn: () => apiClient.get<ProductResponse[]>('/api/products', { page: 1, limit: 1 }),
  });

  const { data: ordersRes, isLoading: ordersLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => apiClient.get<OrderResponse[]>('/api/orders'),
  });

  const { data: statsRes } = useQuery({
    queryKey: ['orders', 'stats'],
    queryFn: () => apiClient.get<{ dailyRevenue: { date: string; revenue: number }[]; statusCounts: { status: string; count: number }[] }>('/api/orders/stats'),
  });

  const { data: lowStockRes } = useQuery({
    queryKey: ['products', 'low-stock'],
    queryFn: () => apiClient.get<any[]>('/api/products/low-stock'),
    staleTime: 1000 * 60 * 2,
  });

  const categoryCount = categoriesRes?.data?.length ?? 0;
  const productTotal = (productsRes as any)?.pagination?.total ?? 0;
  const orderCount = ordersRes?.data?.length ?? 0;
  const pendingOrders =
    ordersRes?.data?.filter((o) => o.status === ORDER_STATUS.PENDING).length ?? 0;
  const lowStockVariants: any[] = lowStockRes?.data ?? [];

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold leading-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Welcome back, {user?.full_name ?? user?.email}
          </p>
        </div>

        {/* Stat Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Categories"
            value={categoryCount}
            icon={Tag}
            description="Active product categories"
            isLoading={catsLoading}
          />
          <StatCard
            title="Total Products"
            value={productTotal}
            icon={Package}
            description="Products in catalog"
            isLoading={prodsLoading}
          />
          <StatCard
            title="Total Orders"
            value={orderCount}
            icon={ClipboardList}
            description="All time orders"
            isLoading={ordersLoading}
          />
          <StatCard
            title="Pending Orders"
            value={pendingOrders}
            icon={TrendingUp}
            description="Awaiting processing"
            isLoading={ordersLoading}
          />
        </div>

        {/* Charts */}
        {statsRes?.data && (
          <div className="grid gap-4 lg:grid-cols-2">
            <RevenueChart data={statsRes.data.dailyRevenue} />
            <OrderStatusChart data={statsRes.data.statusCounts} />
          </div>
        )}

        {/* Low Stock Alert */}
        {lowStockVariants.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-[var(--color-warning-text)]" strokeWidth={1.5} />
              <h2 className="text-lg font-semibold">Low Stock ({lowStockVariants.length})</h2>
            </div>
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="table-header px-4 py-3 text-left">Product</th>
                      <th className="table-header px-4 py-3 text-left">Variant</th>
                      <th className="table-header px-4 py-3 text-left">SKU</th>
                      <th className="table-header px-4 py-3 text-right">Stock</th>
                      <th className="table-header px-4 py-3 text-right">Threshold</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStockVariants.map((v: any) => {
                      const label = [v.size, v.color].filter(Boolean).join(' / ');
                      return (
                        <tr key={v.id} className="border-b last:border-0">
                          <td className="px-4 py-2.5 font-medium">{v.product_name}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{label || '—'}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{v.sku}</td>
                          <td className="px-4 py-2.5 text-right">
                            <span className={v.stock === 0 ? 'font-semibold text-[var(--color-danger-text)] tabular-nums' : 'font-semibold text-[var(--color-warning-text)] tabular-nums'}>
                              {v.stock}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">{v.low_stock_threshold}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Recent Orders */}
        {!ordersLoading && ordersRes?.data && ordersRes.data.length > 0 && (
          <div>
            <h2 className="mb-3 text-lg font-semibold">Recent Orders</h2>
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="table-header px-4 py-3 text-left">Order ID</th>
                      <th className="table-header px-4 py-3 text-left">Status</th>
                      <th className="table-header px-4 py-3 text-left">Items</th>
                      <th className="table-header px-4 py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordersRes.data.slice(0, 5).map((order) => (
                      <tr key={order.id} className="border-b last:border-0">
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          #{order.id.slice(-6).toUpperCase()}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={getOrderStatusVariant(order.status)}>
                            {order.status.toLowerCase()}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">
                          KES {order.total_amount.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
