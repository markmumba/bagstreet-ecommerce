import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { apiClient } from '@/services/api';
import { Tag, Package, ClipboardList, TrendingUp } from 'lucide-react';
import type { Category, ProductResponse, OrderResponse } from 'shared';

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
});

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
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-8 w-16 animate-pulse rounded bg-muted" />
        ) : (
          <div className="text-3xl font-bold">{value}</div>
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

  const categoryCount = categoriesRes?.data?.length ?? 0;
  const productTotal = (productsRes as any)?.pagination?.total ?? 0;
  const orderCount = ordersRes?.data?.length ?? 0;
  const pendingOrders =
    ordersRes?.data?.filter((o) => o.status === 'PENDING').length ?? 0;

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-muted-foreground">
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

        {/* Recent Orders */}
        {!ordersLoading && ordersRes?.data && ordersRes.data.length > 0 && (
          <div>
            <h2 className="mb-3 text-lg font-semibold">Recent Orders</h2>
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Order ID</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Items</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordersRes.data.slice(0, 5).map((order) => (
                      <tr key={order.id} className="border-b last:border-0">
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          #{order.id.slice(-6).toUpperCase()}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              order.status === 'PENDING'
                                ? 'bg-yellow-100 text-yellow-800'
                                : order.status === 'DELIVERED'
                                ? 'bg-green-100 text-green-800'
                                : order.status === 'CANCELLED'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {order.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          ${order.total_amount.toFixed(2)}
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
