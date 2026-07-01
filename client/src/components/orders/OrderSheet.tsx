import { useState } from 'react';
import { ORDER_STATUS, PAYMENT_STATUS, USER_ROLE } from 'shared';
import type { OrderResponse, OrderStatus } from 'shared';
import { useConfirmOrderPayment, useUpdateOrderStatus } from '@/hooks/useOrders';
import { useAuth } from '@/context/AuthContext';
import { OrderReceiptDialog } from './OrderReceiptDialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Mail, MapPin, Phone, ReceiptText } from 'lucide-react';

const ORDER_STATUSES: OrderStatus[] = [
  ORDER_STATUS.DELIVERED,
  ORDER_STATUS.CANCELLED,
  ORDER_STATUS.REFUNDED,
];

const LOCKED_STATUS_UPDATES: OrderStatus[] = [ORDER_STATUS.CANCELLED, ORDER_STATUS.REFUNDED];
const PAYMENT_CONFIRM_BLOCKED_STATUSES: OrderStatus[] = [ORDER_STATUS.CANCELLED, ORDER_STATUS.REFUNDED];
const STATUS_LABELS: Record<OrderStatus, string> = {
  [ORDER_STATUS.PENDING]: 'Pending',
  [ORDER_STATUS.CONFIRMED]: 'Confirmed',
  [ORDER_STATUS.PROCESSING]: 'Processing',
  [ORDER_STATUS.SHIPPED]: 'Shipped',
  [ORDER_STATUS.DELIVERED]: 'Received',
  [ORDER_STATUS.CANCELLED]: 'Cancelled',
  [ORDER_STATUS.REFUNDED]: 'Refunded',
};

const STATUS_VARIANTS: Record<OrderStatus, React.ComponentProps<typeof Badge>['variant']> = {
  PENDING: 'warning',
  CONFIRMED: 'info',
  PROCESSING: 'info',
  SHIPPED: 'info',
  DELIVERED: 'success',
  CANCELLED: 'danger',
  REFUNDED: 'neutral',
};

function availableStatusUpdates(current: OrderStatus, paymentStatus: string) {
  if (paymentStatus !== PAYMENT_STATUS.PAID) return [ORDER_STATUS.CANCELLED];
  if (current === ORDER_STATUS.DELIVERED) return [ORDER_STATUS.REFUNDED];
  if (current === ORDER_STATUS.CONFIRMED) return [ORDER_STATUS.DELIVERED, ORDER_STATUS.REFUNDED];
  return ORDER_STATUSES.filter((status) => status !== current);
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function addressLines(addr: OrderResponse['shipping_address']) {
  return [
    addr.address_line1,
    addr.address_line2,
    [addr.city, addr.state, addr.postal_code].filter(Boolean).join(', '),
    addr.country,
  ].filter(Boolean);
}

interface OrderSheetProps {
  order: OrderResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrderSheet({ order, open, onOpenChange }: OrderSheetProps) {
  const { user } = useAuth();
  const canManageOrders = user?.role === USER_ROLE.ADMIN;

  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const updateStatus = useUpdateOrderStatus();
  const confirmPayment = useConfirmOrderPayment();

  const handleStatusUpdate = async () => {
    if (!order || !selectedStatus) return;
    setError(null);
    try {
      await updateStatus.mutateAsync({ id: order.id, status: selectedStatus as OrderStatus });
      setSelectedStatus('');
    } catch (err: any) {
      setError(err?.message || 'Failed to update status');
    }
  };

  const handleConfirmPayment = async () => {
    if (!order) return;
    setError(null);
    try {
      await confirmPayment.mutateAsync({ id: order.id });
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to confirm payment');
    }
  };

  if (!order) return null;

  const { shipping_address: addr } = order;

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle>Order {order.order_number ?? `#${order.id.slice(-8).toUpperCase()}`}</SheetTitle>
          <SheetDescription>Placed {formatDate(order.created_at)}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-4 pb-6">
          {/* Status */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Status</span>
              <Badge variant={STATUS_VARIANTS[order.status]}>
                {STATUS_LABELS[order.status] ?? order.status}
              </Badge>
            </div>

            {canManageOrders && !LOCKED_STATUS_UPDATES.includes(order.status) && (
              <div className="flex gap-2">
                <Select
                  value={selectedStatus}
                  onValueChange={(v) => setSelectedStatus(v as OrderStatus)}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Change status…" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableStatusUpdates(order.status, (order as any).payment_status).map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABELS[s] ?? s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={!selectedStatus || updateStatus.isPending}
                  onClick={handleStatusUpdate}
                >
                  {updateStatus.isPending ? 'Saving…' : 'Update'}
                </Button>
              </div>
            )}

            {error && (
              <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          <Separator />

          {/* Delivery */}
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Delivery Details</h3>
            <div className="rounded-xl border p-3 text-sm">
              <div className="space-y-3">
                <div>
                  <p className="font-medium text-foreground">{addr.full_name || 'Guest customer'}</p>
                  <div className="mt-1 flex flex-col gap-1 text-xs text-muted-foreground">
                    {addr.email && (
                      <span className="inline-flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5" strokeWidth={1.8} />
                        {addr.email}
                      </span>
                    )}
                    {addr.phone && (
                      <span className="inline-flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5" strokeWidth={1.8} />
                        {addr.phone}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 text-muted-foreground">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
                  <div className="min-w-0 space-y-0.5">
                    {addressLines(addr).length > 0 ? (
                      addressLines(addr).map((line) => <p key={line}>{line}</p>)
                    ) : (
                      <p>No delivery address captured</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {order.notes && (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold">Notes</h3>
              <p className="text-sm text-muted-foreground">{order.notes}</p>
            </div>
          )}

          <Separator />

          {/* Items */}
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">Items ({order.items.length})</h3>
            <div className="divide-y rounded-xl border">
              {order.items.map((item) => {
                const variantLabel = [item.variant_size, item.variant_color].filter(Boolean).join(' / ');
                return (
                  <div key={item.id} className="flex items-start justify-between px-3 py-2.5 text-sm gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{item.product_name}</p>
                      {variantLabel && (
                        <p className="text-xs text-muted-foreground">{variantLabel}</p>
                      )}
                      {item.variant_sku && (
                        <p className="text-xs font-mono text-muted-foreground/70">SKU: {item.variant_sku}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.quantity} × KES {item.unit_price.toFixed(2)}
                      </p>
                    </div>
                    <span className="font-medium shrink-0">KES {item.subtotal.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>

            {(order as any).shipping_cost > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground pt-2">
                <span>Delivery</span>
                <span>KES {(order as any).shipping_cost.toFixed(2)}</span>
              </div>
            )}
            {(order as any).discount_amount > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Discount{(order as any).discount_code ? ` (${(order as any).discount_code})` : ''}</span>
                <span>-KES {(order as any).discount_amount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-3 font-semibold text-sm">
              <span>Total</span>
              <span>KES {order.total_amount.toFixed(2)}</span>
            </div>
            {(order as any).payment_status && (
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>Payment</span>
                <div className="flex items-center gap-2">
                  <Badge variant={(order as any).payment_status === PAYMENT_STATUS.PAID ? 'default' : (order as any).payment_status === PAYMENT_STATUS.FAILED ? 'destructive' : 'secondary'} className="text-xs">
                    {(order as any).payment_status}
                  </Badge>
                  {(order as any).payment_status === PAYMENT_STATUS.PAID && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setReceiptOpen(true)}
                    >
                      <ReceiptText className="h-4 w-4" />
                      Receipt
                    </Button>
                  )}
                  {canManageOrders && (order as any).payment_status !== PAYMENT_STATUS.PAID && !PAYMENT_CONFIRM_BLOCKED_STATUSES.includes(order.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleConfirmPayment}
                      disabled={confirmPayment.isPending}
                    >
                      {confirmPayment.isPending ? 'Confirming...' : 'Mark as Paid'}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
    <OrderReceiptDialog
      orderId={order.id}
      open={receiptOpen}
      onOpenChange={setReceiptOpen}
    />
    </>
  );
}
