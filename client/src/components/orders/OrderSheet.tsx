import { useEffect, useState } from 'react';
import { ORDER_ACTION, ORDER_STATUS, PAYMENT_STATUS, USER_ROLE } from 'shared';
import type { OrderAction, OrderResponse, OrderStatus } from 'shared';
import { useConfirmOrderPayment, useUpdateOrderStatus, useWriteOffReversal } from '@/hooks/useOrders';
import { useAuth } from '@/context/AuthContext';
import { OrderReceiptDialog } from './OrderReceiptDialog';
import { OrderPaymentsPanel } from './OrderPaymentsPanel';
import { PaymentStatusChip } from './PaymentStatusChip';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Mail, MapPin, Phone, ReceiptText } from 'lucide-react';

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

function actionLabel(action: OrderAction, order: OrderResponse) {
  switch (action) {
    case ORDER_ACTION.MARK_PAID:
      return order.payment_status === PAYMENT_STATUS.HELD ? 'Accept payment' : 'Mark as paid';
    case ORDER_ACTION.MARK_DELIVERED:
      return 'Mark received';
    case ORDER_ACTION.CANCEL:
      return order.payment_status === PAYMENT_STATUS.REVERSED ? 'Cancel & restock' : 'Cancel order';
    case ORDER_ACTION.WRITE_OFF:
      return 'Write off';
    case ORDER_ACTION.REFUND:
      return 'Record refund';
  }
}

function cancelWarning(order: OrderResponse) {
  if (order.payment_status === PAYMENT_STATUS.HELD) {
    return 'Cancel this order? Its items go back into stock and the money received becomes a refund owed.';
  }
  if (order.payment_status === PAYMENT_STATUS.REVERSED) {
    return 'Cancel this order and put its items back into stock? Only do this if the goods are back with you.';
  }
  return 'Cancel this unpaid order? Its items go back into stock and any discount use is released.';
}

/** What needs a decision on this order, in plain words. */
function situation(order: OrderResponse): { tone: 'warning' | 'danger' | 'neutral'; text: string } | null {
  const { status, payment_status: payment } = order;
  // A refund owed on a cancelled order is shown by the payments panel, which knows what's been sent back.
  if (payment === PAYMENT_STATUS.HELD && status !== ORDER_STATUS.CANCELLED) {
    return { tone: 'warning', text: "Money arrived that doesn't match the order total. Check the payments below, then accept it, or cancel the order (the money becomes a refund owed)." };
  }
  if (payment === PAYMENT_STATUS.REVERSED && status !== ORDER_STATUS.CANCELLED) {
    return { tone: 'danger', text: 'The payment provider took this payment back. Cancel and restock if the goods are still with you, mark it paid if the customer paid another way, or write it off.' };
  }
  if (payment === PAYMENT_STATUS.REVERSED) {
    return { tone: 'neutral', text: 'This payment was reversed; the order was cancelled and its items restocked.' };
  }
  return null;
}

const SITUATION_STYLES = {
  warning: 'border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]',
  danger: 'border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]',
  neutral: 'border-[var(--color-neutral-border)] bg-[var(--color-neutral-bg)] text-[var(--color-neutral-text)]',
};

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

  const [latest, setLatest] = useState<OrderResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [writingOff, setWritingOff] = useState(false);
  const [writeOffNote, setWriteOffNote] = useState('');
  const updateStatus = useUpdateOrderStatus();
  const confirmPayment = useConfirmOrderPayment();
  const writeOff = useWriteOffReversal();
  const busy = updateStatus.isPending || confirmPayment.isPending || writeOff.isPending;

  useEffect(() => {
    setLatest(null);
    setError(null);
    setConfirmingCancel(false);
    setWritingOff(false);
    setWriteOffNote('');
  }, [order?.id]);

  // The sheet is opened with a row from the list; after an action, show the order the server returned.
  const current = latest && latest.id === order?.id ? latest : order;

  const run = async (action: () => Promise<{ data?: OrderResponse }>, fallback: string) => {
    setError(null);
    try {
      const res = await action();
      if (res.data) setLatest(res.data);
      setConfirmingCancel(false);
      setWritingOff(false);
      setWriteOffNote('');
    } catch (err: any) {
      setError(err?.message || fallback);
    }
  };

  const handleAction = (action: OrderAction) => {
    if (!current) return;
    if (action === ORDER_ACTION.CANCEL) return setConfirmingCancel(true);
    if (action === ORDER_ACTION.WRITE_OFF) return setWritingOff(true);
    if (action === ORDER_ACTION.MARK_PAID) {
      return run(() => confirmPayment.mutateAsync({ id: current.id }), 'Failed to mark as paid');
    }
    return run(() => updateStatus.mutateAsync({ id: current.id, status: ORDER_STATUS.DELIVERED }), 'Failed to update order');
  };

  if (!current) return null;
  const allowed = canManageOrders ? (current.available_actions ?? []) : [];
  // Refunds are recorded in the payments panel, where the amount left to refund is known.
  const actions = allowed.filter((action) => action !== ORDER_ACTION.REFUND);
  const note = situation(current);

  const { shipping_address: addr } = current;

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle>Order {current.order_number ?? `#${current.id.slice(-8).toUpperCase()}`}</SheetTitle>
          <SheetDescription>Placed {formatDate(current.created_at)}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-4 pb-6">
          {/* Status and what to do next */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">Status</span>
              <Badge variant={STATUS_VARIANTS[current.status]}>
                {STATUS_LABELS[current.status] ?? current.status}
              </Badge>
              <PaymentStatusChip status={current.payment_status ?? PAYMENT_STATUS.UNPAID} />
            </div>

            {note && (
              <p className={`rounded-xl border px-3 py-2 text-sm ${SITUATION_STYLES[note.tone]}`}>{note.text}</p>
            )}

            {actions.length > 0 && !confirmingCancel && !writingOff && (
              <div className="flex flex-wrap gap-2">
                {actions.map((action) => (
                  <Button
                    key={action}
                    size="sm"
                    variant={action === ORDER_ACTION.CANCEL || action === ORDER_ACTION.WRITE_OFF ? 'outline' : 'default'}
                    disabled={busy}
                    onClick={() => handleAction(action)}
                  >
                    {actionLabel(action, current)}
                  </Button>
                ))}
              </div>
            )}

            {confirmingCancel && (
              <div className="flex flex-col gap-2 rounded-xl border p-3">
                <p className="text-sm">{cancelWarning(current)}</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => run(() => updateStatus.mutateAsync({ id: current.id, status: ORDER_STATUS.CANCELLED }), 'Failed to cancel order')}
                  >
                    {updateStatus.isPending ? 'Cancelling…' : 'Yes, cancel'}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmingCancel(false)}>
                    Keep order
                  </Button>
                </div>
              </div>
            )}

            {writingOff && (
              <div className="flex flex-col gap-2 rounded-xl border p-3">
                <p className="text-sm">
                  Write off the reversed payment as lost. The order stays as it is, with your note on record.
                </p>
                <Textarea
                  value={writeOffNote}
                  onChange={(e) => setWriteOffNote(e.target.value)}
                  placeholder="Why, e.g. goods delivered, chargeback lost, customer unreachable"
                  rows={3}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={busy || writeOffNote.trim().length < 3}
                    onClick={() => run(() => writeOff.mutateAsync({ id: current.id, note: writeOffNote.trim() }), 'Failed to write off')}
                  >
                    {writeOff.isPending ? 'Saving…' : 'Write off'}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => setWritingOff(false)}>
                    Back
                  </Button>
                </div>
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

          {current.notes && (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold">Notes</h3>
              <p className="text-sm text-muted-foreground">{current.notes}</p>
            </div>
          )}

          <Separator />

          {/* Items */}
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">Items ({current.items.length})</h3>
            <div className="divide-y rounded-xl border">
              {current.items.map((item) => {
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

            {current.shipping_cost > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground pt-2">
                <span>Delivery</span>
                <span>KES {current.shipping_cost.toFixed(2)}</span>
              </div>
            )}
            {current.discount_amount > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Discount{current.discount_code ? ` (${current.discount_code})` : ''}</span>
                <span>-KES {current.discount_amount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-3 font-semibold text-sm">
              <span>Total</span>
              <span>KES {current.total_amount.toFixed(2)}</span>
            </div>
            {current.payment_status === PAYMENT_STATUS.PAID && (
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={() => setReceiptOpen(true)}>
                  <ReceiptText className="h-4 w-4" />
                  Receipt
                </Button>
              </div>
            )}
          </div>

          <Separator />

          <OrderPaymentsPanel orderId={current.id} canRefund={allowed.includes(ORDER_ACTION.REFUND)} />
        </div>
      </SheetContent>
    </Sheet>
    <OrderReceiptDialog
      orderId={current.id}
      open={receiptOpen}
      onOpenChange={setReceiptOpen}
    />
    </>
  );
}
