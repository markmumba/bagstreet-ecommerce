import { useState } from 'react';
import type { OrderResponse, OrderStatus } from 'shared';
import { useUpdateOrderStatus } from '@/hooks/useOrders';
import { useAuth } from '@/context/AuthContext';
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

const ORDER_STATUSES: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
];

const STATUS_COLORS: Record<OrderStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  CONFIRMED: 'bg-blue-100 text-blue-800',
  PROCESSING: 'bg-indigo-100 text-indigo-800',
  SHIPPED: 'bg-purple-100 text-purple-800',
  DELIVERED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
  REFUNDED: 'bg-gray-100 text-gray-700',
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

interface OrderSheetProps {
  order: OrderResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrderSheet({ order, open, onOpenChange }: OrderSheetProps) {
  const { user } = useAuth();
  const isStaff = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | ''>('');
  const [error, setError] = useState<string | null>(null);
  const updateStatus = useUpdateOrderStatus();

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

  if (!order) return null;

  const { shipping_address: addr } = order;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle>Order #{order.id.slice(-8).toUpperCase()}</SheetTitle>
          <SheetDescription>Placed {formatDate(order.created_at)}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-4 pb-6">
          {/* Status */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Status</span>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[order.status]}`}
              >
                {order.status}
              </span>
            </div>

            {isStaff && !['DELIVERED', 'REFUNDED'].includes(order.status) && (
              <div className="flex gap-2">
                <Select
                  value={selectedStatus}
                  onValueChange={(v) => setSelectedStatus(v as OrderStatus)}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Change status…" />
                  </SelectTrigger>
                  <SelectContent>
                    {ORDER_STATUSES.filter((s) => s !== order.status).map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
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
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          <Separator />

          {/* Shipping Address */}
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Shipping Address</h3>
            <div className="rounded-md border p-3 text-sm text-muted-foreground space-y-0.5">
              <p className="font-medium text-foreground">{addr.full_name}</p>
              <p>{addr.address_line1}</p>
              {addr.address_line2 && <p>{addr.address_line2}</p>}
              <p>
                {addr.city}, {addr.state} {addr.postal_code}
              </p>
              <p>{addr.country}</p>
              {addr.phone && <p>{addr.phone}</p>}
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
            <div className="rounded-md border divide-y">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">{item.product_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.quantity} × KES {item.unit_price.toFixed(2)}
                    </p>
                  </div>
                  <span className="font-medium">KES {item.subtotal.toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-between border-t pt-3 font-semibold text-sm">
              <span>Total</span>
              <span>KES {order.total_amount.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
