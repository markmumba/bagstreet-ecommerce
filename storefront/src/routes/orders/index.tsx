import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowRight, Package } from 'lucide-react';
import { useOrders } from '@/hooks/useOrders';
import { useAuth } from '@/context/AuthContext';
import { useSeo } from '@/hooks/useSeo';
import type { OrderResponse } from 'shared';
import {
  formatOrderDate,
  formatOrderNumber,
  formatOrderPrice,
  getOrderRouteRef,
  ORDER_STATUS_CLASSES,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_CLASSES,
  PAYMENT_STATUS_LABELS,
} from '@/lib/order-display';

export const Route = createFileRoute('/orders/')({
  component: OrdersPage,
});

function OrdersPage() {
  const { user } = useAuth();
  useSeo({
    title: 'My Orders',
    description: 'View your Bagstreet order history and delivery status.',
    canonicalPath: '/orders',
  });
  const { data: res, isLoading } = useOrders();
  const orders = (res?.data as OrderResponse[]) ?? [];

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h2 className="mb-4 text-2xl font-semibold">Sign in to view your orders</h2>
        <Link
          to="/login"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-24 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Account</p>
          <h1 className="mt-2 text-3xl font-semibold">My Orders</h1>
        </div>
        <p className="text-sm text-muted-foreground">{orders.length} total</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="border border-border bg-card px-6 py-20 text-center">
          <Package className="mx-auto h-9 w-9 text-muted-foreground" strokeWidth={1.4} />
          <p className="mt-5 text-muted-foreground">You haven't placed any orders yet.</p>
          <Link
            to="/"
            className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground"
          >
            Start Shopping
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const previewItems = order.items.slice(0, 2);
            const hiddenItems = Math.max(0, order.items.length - previewItems.length);

            return (
              <article key={order.id} className="border border-border bg-card p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-mono text-xs text-muted-foreground">{formatOrderNumber(order.id, order.order_number)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{formatOrderDate(order.created_at)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${ORDER_STATUS_CLASSES[order.status]}`}>
                      {ORDER_STATUS_LABELS[order.status] ?? order.status}
                    </span>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${PAYMENT_STATUS_CLASSES[order.payment_status]}`}>
                      {PAYMENT_STATUS_LABELS[order.payment_status] ?? order.payment_status}
                    </span>
                  </div>
                </div>

                <div className="mt-5 space-y-2">
                  {previewItems.map((item) => (
                    <div key={item.id} className="flex gap-4 text-sm">
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {item.product_name}
                        {item.variant_size ? ` (${item.variant_size})` : ''}
                        {item.variant_color ? ` / ${item.variant_color}` : ''}
                        {' '}x {item.quantity}
                      </span>
                      <span className="font-medium tabular-nums">{formatOrderPrice(item.subtotal)}</span>
                    </div>
                  ))}
                  {hiddenItems > 0 && (
                    <p className="text-xs text-muted-foreground">+ {hiddenItems} more item{hiddenItems === 1 ? '' : 's'}</p>
                  )}
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Total</p>
                    <p className="mt-1 text-lg font-semibold text-primary">{formatOrderPrice(order.total_amount)}</p>
                  </div>
                  <Link
                    to="/orders/$orderId"
                    params={{ orderId: getOrderRouteRef(order) }}
                    className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium hover:bg-muted"
                  >
                    Details
                    <ArrowRight className="h-4 w-4" strokeWidth={1.6} />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
