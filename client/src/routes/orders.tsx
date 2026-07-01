import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect, useCallback, useRef } from 'react';
import { z } from 'zod';
import type { ColumnDef } from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { OrderSheet } from '@/components/orders/OrderSheet';
import { useOrders } from '@/hooks/useOrders';
import { ordersService } from '@/services/orders.service';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowUpDown, Check, ClipboardList, Copy, Download, Eye, MapPin, PackageCheck, PackageX, Timer, Truck, Wallet, X } from 'lucide-react';
import { ORDER_STATUS, PAYMENT_STATUS } from 'shared';
import type { OrderResponse, OrderStatus, PaymentStatus } from 'shared';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/orders')({
  validateSearch: z.object({
    order_id: z.string().optional(),
  }),
  component: OrdersPage,
});

const LIMIT = 20;

const columnClasses: Record<string, string> = {
  id: 'w-[280px]',
  customer: 'w-[220px]',
  delivery: 'w-[320px]',
  status: 'w-[150px]',
  payment_status: 'w-[140px]',
  items: 'w-[240px]',
  total_amount: 'w-[150px]',
  created_at: 'w-[150px]',
  actions: 'w-[88px]',
};

const STATUS_STYLES: Record<OrderStatus, { label: string; icon: React.ElementType; className: string }> = {
  [ORDER_STATUS.PENDING]: { label: 'Pending', icon: Timer, className: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]' },
  [ORDER_STATUS.CONFIRMED]: { label: 'Confirmed', icon: Check, className: 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]' },
  [ORDER_STATUS.PROCESSING]: { label: 'Processing', icon: PackageCheck, className: 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]' },
  [ORDER_STATUS.SHIPPED]: { label: 'Shipped', icon: Truck, className: 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]' },
  [ORDER_STATUS.DELIVERED]: { label: 'Received', icon: Check, className: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' },
  [ORDER_STATUS.CANCELLED]: { label: 'Cancelled', icon: X, className: 'bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]' },
  [ORDER_STATUS.REFUNDED]: { label: 'Refunded', icon: PackageX, className: 'bg-muted text-muted-foreground' },
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatOrderRef(order: Pick<OrderResponse, 'id' | 'order_number'>) {
  return order.order_number ?? `#${order.id.slice(-8).toUpperCase().padStart(6, '0')}`;
}

function SortHeader({ column, label, className }: { column: any; label: string; className?: string }) {
  return (
    <Button
      variant="ghost"
      onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      className={cn('-ml-3 h-8 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground', className)}
    >
      {label}
      <ArrowUpDown className="h-3.5 w-3.5" strokeWidth={1.5} />
    </Button>
  );
}

function StatusChip({ status }: { status: OrderStatus }) {
  const style = STATUS_STYLES[status];
  const Icon = style.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium', style.className)}>
      <Icon className="h-3 w-3" strokeWidth={2} />
      {style.label}
    </span>
  );
}

function PaymentChip({ status }: { status: PaymentStatus }) {
  const isPaid = status === PAYMENT_STATUS.PAID;
  const isFailed = status === PAYMENT_STATUS.FAILED;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium',
        isPaid
          ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]'
          : isFailed
          ? 'bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]'
          : 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]'
      )}
    >
      {isPaid ? <Check className="h-3 w-3" strokeWidth={2} /> : isFailed ? <X className="h-3 w-3" strokeWidth={2} /> : <Wallet className="h-3 w-3" strokeWidth={2} />}
      {isPaid ? 'Paid' : isFailed ? 'Failed' : 'Unpaid'}
    </span>
  );
}

function copyOrderRef(order: OrderResponse) {
  navigator.clipboard?.writeText(formatOrderRef(order)).catch(() => undefined);
}

function addressLine(address: OrderResponse['shipping_address']) {
  return [
    address.address_line1,
    address.address_line2,
    [address.city, address.state, address.postal_code].filter(Boolean).join(', '),
    address.country,
  ].filter(Boolean).join(' · ');
}

function OrderCard({ order, onOpen }: { order: OrderResponse; onOpen: (order: OrderResponse) => void }) {
  const address = order.shipping_address;
  const firstItem = order.items[0];
  const isMuted = order.status === ORDER_STATUS.CANCELLED || order.status === ORDER_STATUS.REFUNDED;

  return (
    <button
      type="button"
      onClick={() => onOpen(order)}
      className={cn(
        'w-full rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:bg-muted/40',
        isMuted && 'bg-muted/30 text-muted-foreground'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-foreground">{formatOrderRef(order)}</span>
            <span className="text-xs text-muted-foreground">{formatDate(order.created_at)}</span>
          </div>
          <p className="mt-2 truncate font-medium text-foreground">{address.full_name || 'Guest customer'}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {address.phone || address.email || 'No contact'}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-semibold tabular-nums text-foreground">KES {order.total_amount.toFixed(2)}</p>
          {order.discount_amount > 0 && (
            <p className="text-[11px] text-muted-foreground">-{order.discount_amount.toFixed(2)} discount</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <StatusChip status={order.status} />
        <PaymentChip status={order.payment_status ?? PAYMENT_STATUS.UNPAID} />
      </div>

      <div className="mt-4 flex gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
        <span className="line-clamp-2">{addressLine(address) || 'No delivery address'}</span>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-background/60 px-3 py-2">
        <p className="truncate text-sm font-medium text-foreground">
          {firstItem?.product_name ?? 'No items'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {order.items.length} item{order.items.length !== 1 ? 's' : ''}
          {order.items.length > 1 ? ` · +${order.items.length - 1} more` : ''}
        </p>
      </div>
    </button>
  );
}

function OrdersPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const openedSearchOrderRef = useRef<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderResponse | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);

  // Server-side filter state
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [page, setPage] = useState(1);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [statusFilter, paymentFilter]);

  const { data: res, isLoading, error } = useOrders({
    page,
    limit: LIMIT,
    status: statusFilter || undefined,
    payment_status: (paymentFilter || undefined) as PaymentStatus | undefined,
  });

  const orders: OrderResponse[] = res?.data ?? [];
  const total = (res as any)?.pagination?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const openOrder = (order: OrderResponse) => {
    setSelectedOrder(order);
    setSheetOpen(true);
  };

  useEffect(() => {
    if (!search.order_id || openedSearchOrderRef.current === search.order_id) return;
    let cancelled = false;

    async function openSearchOrder() {
      const existing = orders.find((order) => order.id === search.order_id);
      if (existing) {
        openedSearchOrderRef.current = search.order_id!;
        openOrder(existing);
        return;
      }

      try {
        const res = await ordersService.getById(search.order_id!);
        if (!cancelled && res.data) {
          openedSearchOrderRef.current = search.order_id!;
          openOrder(res.data);
        }
      } catch {
        if (!cancelled) openedSearchOrderRef.current = search.order_id!;
      }
    }

    openSearchOrder();
    return () => { cancelled = true; };
  }, [orders, search.order_id]);

  const handleSheetOpenChange = (nextOpen: boolean) => {
    setSheetOpen(nextOpen);
    if (!nextOpen && search.order_id) {
      openedSearchOrderRef.current = null;
      navigate({ to: '/orders', search: {} as any, replace: true });
    }
  };

  const [isExporting, setIsExporting] = useState(false);

  const exportCsv = useCallback(async () => {
    setIsExporting(true);
    try {
      const res = await ordersService.getAll({
        limit: 5000,
        status: statusFilter || undefined,
        payment_status: (paymentFilter || undefined) as PaymentStatus | undefined,
      });
      const rows: OrderResponse[] = (res as any)?.data ?? [];

      const headers = ['Order ID', 'Customer', 'Phone', 'Delivery Address', 'Status', 'Payment', 'Items', 'Shipping (KES)', 'Total (KES)', 'Date'];
      const lines = [
        headers.join(','),
        ...rows.map((o) => {
          const csvValues = [
            formatOrderRef(o),
            o.shipping_address.full_name ?? '',
            o.shipping_address.phone ?? '',
            addressLine(o.shipping_address),
            o.status,
            (o as any).payment_status ?? '',
            o.items.length,
            ((o as any).shipping_cost ?? 0).toFixed(2),
            o.total_amount.toFixed(2),
            new Date(o.created_at).toISOString().slice(0, 10),
          ];
          return csvValues.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',');
        }),
      ];

      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `orders${statusFilter ? `-${statusFilter.toLowerCase()}` : ''}${paymentFilter ? `-${paymentFilter.toLowerCase()}` : ''}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  }, [statusFilter, paymentFilter]);

  const columns: ColumnDef<OrderResponse>[] = [
    {
      accessorKey: 'id',
      header: ({ column }) => <SortHeader column={column} label="Order" />,
      cell: ({ row }) => {
        const order = row.original;
        return (
          <div className="group min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-foreground">{formatOrderRef(order)}</span>
              <button
                type="button"
                title="Copy order ref"
                onClick={(e) => {
                  e.stopPropagation();
                  copyOrderRef(order);
                }}
                className="rounded p-0.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100 focus:opacity-100"
              >
                <Copy className="h-3 w-3" strokeWidth={1.8} />
              </button>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {formatDate(order.created_at)}
            </p>
          </div>
        );
      },
    },
    {
      id: 'customer',
      header: 'Customer',
      cell: ({ row }) => {
        const address = row.original.shipping_address;
        return (
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{address.full_name || 'Guest customer'}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {address.phone || address.email || 'No contact'}
            </p>
          </div>
        );
      },
    },
    {
      id: 'delivery',
      header: 'Delivery',
      cell: ({ row }) => {
        const address = row.original.shipping_address;
        return (
          <div className="flex min-w-0 items-start gap-2">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.8} />
            <div className="min-w-0">
              <p className="truncate text-sm text-foreground">{address.address_line1 || 'No address line'}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {[address.address_line2, address.city, address.state, address.country].filter(Boolean).join(' · ') || 'No delivery location'}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusChip status={row.original.status} />,
    },
    {
      accessorKey: 'payment_status',
      header: 'Payment',
      cell: ({ row }) => {
        const paymentStatus = row.original.payment_status ?? PAYMENT_STATUS.UNPAID;
        return <PaymentChip status={paymentStatus} />;
      },
    },
    {
      id: 'items',
      header: 'Items',
      cell: ({ row }) => {
        const items = row.original.items;
        const firstItem = items[0];
        return (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {firstItem?.product_name ?? 'No items'}
            </p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {items.length} item{items.length !== 1 ? 's' : ''}
              {items.length > 1 ? ` · +${items.length - 1} more` : ''}
            </p>
          </div>
        );
      },
    },
    {
      accessorKey: 'total_amount',
      header: ({ column }) => <SortHeader column={column} label="Total" className="ml-auto" />,
      cell: ({ row }) => (
        <div className="text-right">
          <span className="block font-semibold tabular-nums">KES {row.original.total_amount.toFixed(2)}</span>
          {row.original.discount_amount > 0 && (
            <span className="text-[11px] text-muted-foreground">-{row.original.discount_amount.toFixed(2)} discount</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => <SortHeader column={column} label="Date" />,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.original.created_at)}</span>
      ),
    },
    {
      id: 'actions',
      header: () => <div className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</div>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            title="View order"
            className="h-8 w-8 px-0 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
            onClick={(e) => { e.stopPropagation(); openOrder(row.original); }}
          >
            <Eye className="h-4 w-4" strokeWidth={1.7} />
          </Button>
        </div>
      ),
    },
  ];

  const table = useReactTable({
    data: orders,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  });

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold leading-tight">Orders</h1>
          <p className="mt-1 text-sm text-muted-foreground">Track and manage customer orders</p>
        </div>

        {isLoading && (
          <div className="rounded-xl border bg-card p-6">
            <div className="space-y-3">
              <div className="skeleton h-8 w-36" />
              <div className="skeleton h-4 w-52" />
              <div className="skeleton h-28 w-full" />
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4">
            <p className="text-sm font-medium text-destructive">Failed to load orders</p>
          </div>
        )}

        {!isLoading && !error && (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value={ORDER_STATUS.PENDING}>Pending</SelectItem>
                  <SelectItem value={ORDER_STATUS.CONFIRMED}>Confirmed</SelectItem>
                  <SelectItem value={ORDER_STATUS.DELIVERED}>Received</SelectItem>
                  <SelectItem value={ORDER_STATUS.CANCELLED}>Cancelled</SelectItem>
                  <SelectItem value={ORDER_STATUS.REFUNDED}>Refunded</SelectItem>
                </SelectContent>
              </Select>
              <Select value={paymentFilter} onValueChange={(v) => setPaymentFilter(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue placeholder="All payments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All payments</SelectItem>
                  <SelectItem value={PAYMENT_STATUS.UNPAID}>Unpaid</SelectItem>
                  <SelectItem value={PAYMENT_STATUS.PAID}>Paid</SelectItem>
                  <SelectItem value={PAYMENT_STATUS.FAILED}>Failed</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStatusFilter(ORDER_STATUS.PENDING);
                  setPaymentFilter(PAYMENT_STATUS.UNPAID);
                }}
              >
                Pending unpaid
              </Button>
              <div className="flex w-full items-center justify-between gap-3 sm:ml-auto sm:w-auto sm:justify-end">
                <span className="text-sm text-muted-foreground">
                  {total} order{total !== 1 ? 's' : ''}
                </span>
                <Button variant="outline" size="sm" onClick={exportCsv} disabled={isExporting || total === 0}>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  {isExporting ? 'Exporting...' : 'Export CSV'}
                </Button>
              </div>
            </div>

            <div className="space-y-3 lg:hidden">
              {orders.length ? (
                orders.map((order) => (
                  <OrderCard key={order.id} order={order} onOpen={openOrder} />
                ))
              ) : (
                <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
                  <ClipboardList className="mx-auto h-6 w-6" strokeWidth={1.5} />
                  <p className="mt-3 font-medium text-foreground">
                    {statusFilter ? `No ${statusFilter} orders right now` : 'No orders yet'}
                  </p>
                  <p className="mt-1 text-sm">
                    {statusFilter ? 'All caught up.' : 'Share your store link on Instagram to get started.'}
                  </p>
                </div>
              )}
            </div>

            <div className="hidden overflow-hidden rounded-xl border bg-card lg:block">
              <Table className="min-w-[1500px] table-fixed">
                <TableHeader>
                  {table.getHeaderGroups().map((hg) => (
                    <TableRow key={hg.id}>
                      {hg.headers.map((h) => (
                        <TableHead key={h.id} className={columnClasses[h.column.id]}>
                          {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.length ? (
                    table.getRowModel().rows.map((row) => (
                      <TableRow
                        key={row.id}
                        className={cn(
                          'group cursor-pointer hover:bg-muted/50',
                          (row.original.status === ORDER_STATUS.CANCELLED || row.original.status === ORDER_STATUS.REFUNDED)
                            && 'bg-muted/30 text-muted-foreground hover:bg-muted/40'
                        )}
                        onClick={() => openOrder(row.original)}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id} className={columnClasses[cell.column.id]}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="h-[200px] text-center text-muted-foreground">
                        <div className="flex flex-col items-center gap-3">
                          <ClipboardList className="h-6 w-6" strokeWidth={1.5} />
                          <div>
                            <p className="font-medium text-foreground">
                              {statusFilter ? `No ${statusFilter} orders right now` : 'No orders yet'}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {statusFilter ? 'All caught up.' : 'Share your store link on Instagram to get started.'}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground tabular-nums">
                Page {page} of {totalPages} · {total} total
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <OrderSheet order={selectedOrder} open={sheetOpen} onOpenChange={handleSheetOpenChange} />
    </DashboardLayout>
  );
}
