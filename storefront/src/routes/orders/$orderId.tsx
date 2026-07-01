import { createFileRoute, Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  CreditCard,
  Mail,
  MapPin,
  Package,
  Phone,
  ShoppingBag,
} from 'lucide-react';
import { PAYMENT_STATUS } from 'shared';
import { PaymentReceipt } from '@/components/orders/PaymentReceipt';
import { useAuth } from '@/context/AuthContext';
import { useOrder } from '@/hooks/useOrders';
import { useSeo } from '@/hooks/useSeo';
import {
  formatOrderDateTime,
  formatOrderNumber,
  formatOrderPrice,
  getAddressLines,
  getOrderSubtotal,
  getOrderRouteRef,
  ORDER_STATUS_CLASSES,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_CLASSES,
  PAYMENT_STATUS_LABELS,
} from '@/lib/order-display';

export const Route = createFileRoute('/orders/$orderId')({
  component: OrderDetailPage,
});

function OrderDetailPage() {
  const { orderId } = Route.useParams();
  const { user } = useAuth();
  const { data: res, isLoading, isError } = useOrder(orderId);
  const order = res?.data;

  useSeo({
    title: order ? `Order ${formatOrderNumber(order.id, order.order_number)}` : 'Order Details',
    description: 'View your Bagstreet order details, delivery information, and payment status.',
    canonicalPath: `/orders/${orderId}`,
  });

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h2 className="mb-4 text-2xl font-semibold">Sign in to view this order</h2>
        <Link
          to="/login"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="mb-8 h-10 w-40 animate-pulse rounded-md bg-muted" />
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="h-96 animate-pulse rounded-lg bg-muted" />
          <div className="h-96 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <Package className="mx-auto h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
        <h1 className="mt-5 text-2xl font-semibold">Order not found</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          We could not find that order for your account.
        </p>
        <Link
          to="/orders"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-md border border-border px-5 text-sm font-medium hover:bg-muted"
        >
          Back to Orders
        </Link>
      </div>
    );
  }

  const subtotal = getOrderSubtotal(order);
  const addressLines = getAddressLines(order.shipping_address);
  const orderNumber = formatOrderNumber(order.id, order.order_number);
  const hasReceipt = order.payment_status === PAYMENT_STATUS.PAID;

  return (
    <div className="mx-auto max-w-5xl px-4 py-24 sm:px-6 lg:px-8">
      <Link
        to="/orders"
        className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.6} />
        Back to orders
      </Link>

      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Order details</p>
          <h1 className="mt-2 text-3xl font-semibold">{orderNumber}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Placed {formatOrderDateTime(order.created_at)}
          </p>
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

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-lg font-semibold">Items</h2>
          </div>
          <div className="divide-y divide-border">
            {order.items.map((item) => (
              <div key={item.id} className="grid gap-4 px-5 py-5 sm:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <Link
                    to="/products/$productId"
                    params={{ productId: item.product_slug ?? item.product_id }}
                    className="font-medium hover:text-primary"
                  >
                    {item.product_name}
                  </Link>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {item.variant_size && <span>Size: {item.variant_size}</span>}
                    {item.variant_color && <span>Color: {item.variant_color}</span>}
                    {item.variant_sku && <span>SKU: {item.variant_sku}</span>}
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {item.quantity} x {formatOrderPrice(item.unit_price)}
                  </p>
                </div>
                <p className="text-right font-semibold tabular-nums">{formatOrderPrice(item.subtotal)}</p>
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-6">
          <section className="border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />
              <h2 className="font-semibold">Payment</h2>
            </div>
            <div className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium tabular-nums">{formatOrderPrice(subtotal)}</span>
              </div>
              {order.discount_amount > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">
                    Discount{order.discount_code ? ` (${order.discount_code})` : ''}
                  </span>
                  <span className="font-medium tabular-nums">-{formatOrderPrice(order.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Delivery</span>
                <span className="font-medium tabular-nums">{formatOrderPrice(order.shipping_cost)}</span>
              </div>
              <div className="flex justify-between gap-4 border-t border-border pt-3 text-base">
                <span className="font-semibold">Total</span>
                <span className="font-semibold text-primary tabular-nums">{formatOrderPrice(order.total_amount)}</span>
              </div>
            </div>
            {order.payment_reference && (
              <p className="mt-4 break-all text-xs text-muted-foreground">
                Reference: {order.payment_reference}
              </p>
            )}
          </section>

          <PaymentReceipt orderId={getOrderRouteRef(order)} enabled={hasReceipt} />

          <section className="border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />
              <h2 className="font-semibold">Delivery</h2>
            </div>
            <div className="mt-5 space-y-4 text-sm">
              <div>
                <p className="font-medium">{order.shipping_address.full_name}</p>
                <div className="mt-2 space-y-1 text-muted-foreground">
                  {addressLines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              </div>
              <div className="space-y-2 text-muted-foreground">
                {order.shipping_address.email && (
                  <p className="flex items-center gap-2">
                    <Mail className="h-4 w-4" strokeWidth={1.5} />
                    {order.shipping_address.email}
                  </p>
                )}
                {order.shipping_address.phone && (
                  <p className="flex items-center gap-2">
                    <Phone className="h-4 w-4" strokeWidth={1.5} />
                    {order.shipping_address.phone}
                  </p>
                )}
              </div>
            </div>
          </section>

          {order.notes && (
            <section className="border border-border bg-card p-5">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />
                <h2 className="font-semibold">Order notes</h2>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">{order.notes}</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
