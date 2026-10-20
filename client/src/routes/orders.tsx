import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect, useCallback, useRef } from 'react';
import { z } from 'zod';
import type { ColumnDef } from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { OrderSheet } from '@/components/orders/OrderSheet';
import { PAYMENT_STATUS_STYLES, PaymentStatusChip } from '@/components/orders/PaymentStatusChip';
import { WalkInSaleDialog } from '@/components/orders/WalkInSaleDialog';
import { useOrders } from '@/hooks/useOrders';
import { ordersService, type OrderSortField } from '@/services/orders.service';
import { useAuth } from '@/context/AuthContext';
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
import { ArrowUpDown, Check, ClipboardList, Copy, Download, Eye, Gift, MapPin, PackageCheck, PackageX, Plus, ShoppingBag, Timer, Truck, X } from 'lucide-react';
import { ORDER_SOURCE, ORDER_STATUS, PAYMENT_STATUS, USER_ROLE } from 'shared';
import type { OrderResponse, OrderStatus, PaymentStatus } from 'shared';
import { cn } from '@/lib/utils';
import { formatDate, formatMoney, nairobiDay } from '@/lib/format';
import { toast } from '@/lib/toast';
import { ErrorNotice, errorMessage } from '@/components/ui/notice';

export const Route = createFileRoute('/orders')({
  // Filters, page and sort live in the URL, so refresh, Back and shared links keep them.
  validateSearch: z.object({
    order_id: z.string().optional(),
    status: z.string().optional().catch(undefined),
    payment: z.string().optional().catch(undefined),
    page: z.coerce.number().int().min(1).optional().catch(undefined),
    sort: z.enum(['date', 'total', 'order', 'customer']).optional().catch(undefined),
    dir: z.enum(['asc', 'desc']).optional().catch(undefined),
  }),
  component: OrdersPage,
});

const LIMIT = 20;

// Less important columns drop out on narrower screens so Total, Date and Actions stay in view
// (the order sheet has everything).
const columnClasses: Record<string, string> = {
  id: 'w-[220px]',
  customer: 'w-[200px]',
  source: 'hidden w-[120px] xl:table-cell',
  delivery: 'hidden w-[280px] 2xl:table-cell',
  status: 'w-[140px]',
  payment_status: 'w-[140px]',
  items: 'hidden w-[220px] 2xl:table-cell',
  total_amount: 'w-[140px]',
  created_at: 'w-[130px]',
  actions: 'w-[72px]',
};

/** Table column → server sort field. */
const SORT_FIELDS: Record<string, OrderSortField> = { id: 'order', total_amount: 'total', created_at: 'date' };

const STATUS_STYLES: Record<OrderStatus, { label: string; icon: React.ElementType; className: string }> = {
  [ORDER_STATUS.PENDING]: { label: 'Pending', icon: Timer, className: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]' },
  [ORDER_STATUS.CONFIRMED]: { label: 'Confirmed', icon: Check, className: 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]' },
  [ORDER_STATUS.PROCESSING]: { label: 'Processing', icon: PackageCheck, className: 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]' },
  [ORDER_STATUS.SHIPPED]: { label: 'Out for delivery', icon: Truck, className: 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]' },
  [ORDER_STATUS.DELIVERED]: { label: 'Received', icon: Check, className: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' },
  [ORDER_STATUS.CANCELLED]: { label: 'Cancelled', icon: X, className: 'bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]' },
  [ORDER_STATUS.REFUNDED]: { label: 'Refunded', icon: PackageX, className: 'bg-muted text-muted-foreground' },
};


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

function SourceChip({ source }: { source?: OrderResponse['order_source'] }) {
  const kind = source === ORDER_SOURCE.WALK_IN ? 'walk_in' : source === ORDER_SOURCE.GIFT_VOUCHER ? 'voucher' : 'online';
  const Icon = kind === 'walk_in' ? ShoppingBag : kind === 'voucher' ? Gift : Truck;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium',
        kind === 'walk_in'
          ? 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]'
          : kind === 'voucher'
            ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]'
            : 'bg-muted text-muted-foreground'
      )}
    >
      <Icon className="h-3 w-3" strokeWidth={2} />
      {kind === 'walk_in' ? 'Walk-in' : kind === 'voucher' ? 'Gift voucher' : 'Online'}
    </span>
  );
}

/** What an empty list says: why it's empty, in words staff use, and what to do. */
function emptyOrdersCopy(statusFilter: string, paymentFilter: string) {
  if (!statusFilter && !paymentFilter) {
    return { title: 'No orders yet', hint: 'Share your store link on Instagram to get started.' };
  }
  const labels = [
    statusFilter && (STATUS_STYLES[statusFilter as OrderStatus]?.label ?? statusFilter),
    paymentFilter && (PAYMENT_STATUS_STYLES[paymentFilter as PaymentStatus]?.label ?? paymentFilter),
  ].filter(Boolean).map((label) => `“${label}”`);
  return {
    title: 'No orders match these filters',
    hint: `No orders are ${labels.join(' and ')} right now. Choose “All statuses” and “All payments” to see every order.`,
  };
}

function copyOrderRef(order: OrderResponse) {
  const ref = formatOrderRef(order);
  navigator.clipboard?.writeText(ref)
    .then(() => toast.success(`Copied ${ref}`))
    .catch(() => toast.error('Copying isn’t allowed here. Select the order number instead.'));
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
          <p className="font-semibold tabular-nums text-foreground">{formatMoney(order.total_amount)}</p>
          {order.discount_amount > 0 && (
            <p className="text-[11px] tabular-nums text-muted-foreground">−{formatMoney(order.discount_amount)} discount</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <SourceChip source={order.order_source} />
        <StatusChip status={order.status} />
        <PaymentStatusChip status={order.payment_status ?? PAYMENT_STATUS.UNPAID} />
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
  const { user } = useAuth();
  const search = Route.useSearch();
  const openedSearchOrderRef = useRef<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderResponse | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [walkInOpen, setWalkInOpen] = useState(false);
  // Filters, page and sort come from the URL; changing a filter goes back to page 1.
  const statusFilter = search.status ?? '';
  const paymentFilter = search.payment ?? '';
  const page = search.page ?? 1;
  const sortBy: OrderSortField = search.sort ?? 'date';
  const sortDir = search.dir ?? 'desc';
  const updateSearch = (patch: Partial<typeof search>) =>
    navigate({ to: '/orders', search: (prev: typeof search) => ({ ...prev, ...patch }), replace: true });
  const setStatusFilter = (status: string) => updateSearch({ status: status || undefined, page: undefined });
  const setPaymentFilter = (payment: string) => updateSearch({ payment: payment || undefined, page: undefined });
  const setPage = (next: number | ((current: number) => number)) => {
    const value = typeof next === 'function' ? next(page) : next;
    updateSearch({ page: value > 1 ? value : undefined });
  };
  const sortColumn = Object.entries(SORT_FIELDS).find(([, field]) => field === sortBy)?.[0] ?? 'created_at';
  const sorting: SortingState = [{ id: sortColumn, desc: sortDir === 'desc' }];
  const setSorting = (updater: SortingState | ((old: SortingState) => SortingState)) => {
    const next = (typeof updater === 'function' ? updater(sorting) : updater)[0];
    const field = next ? SORT_FIELDS[next.id] : undefined;
    updateSearch({
      sort: field && field !== 'date' ? field : undefined,
      dir: field && !(field === 'date' && next!.desc) ? (next!.desc ? 'desc' : 'asc') : undefined,
      page: undefined,
    });
  };

  const { data: res, isLoading, error, refetch, isRefetching } = useOrders({
    page,
    limit: LIMIT,
    status: statusFilter || undefined,
    payment_status: (paymentFilter || undefined) as PaymentStatus | undefined,
    sort: sortBy,
    dir: sortDir,
  });

  const orders: OrderResponse[] = res?.items ?? [];
  const total = res?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const empty = emptyOrdersCopy(statusFilter, paymentFilter);
  const canCreateWalkInSale = user?.role === USER_ROLE.ADMIN || user?.role === USER_ROLE.MANAGER;

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
        const order = await ordersService.getById(search.order_id!);
        if (!cancelled) {
          openedSearchOrderRef.current = search.order_id!;
          openOrder(order);
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
      updateSearch({ order_id: undefined });
    }
  };

  const [isExporting, setIsExporting] = useState(false);

  const exportCsv = useCallback(async () => {
    setIsExporting(true);
    try {
      // The API returns at most 100 orders per page, so fetch every page.
      const rows: OrderResponse[] = [];
      for (let page = 1; ; page++) {
        const res = await ordersService.getAll({
          page,
          limit: 100,
          status: statusFilter || undefined,
          payment_status: (paymentFilter || undefined) as PaymentStatus | undefined,
        });
        rows.push(...res.items);
        if (res.items.length === 0 || rows.length >= res.total) break;
      }

      const headers = ['Order ID', 'Source', 'Customer', 'Phone', 'Delivery Address', 'Status', 'Payment', 'Items', 'Shipping (KES)', 'Total (KES)', 'Date'];
      const lines = [
        headers.join(','),
        ...rows.map((o) => {
          const csvValues = [
            formatOrderRef(o),
            o.order_source ?? ORDER_SOURCE.ONLINE,
            o.shipping_address.full_name ?? '',
            o.shipping_address.phone ?? '',
            addressLine(o.shipping_address),
            o.status,
            o.payment_status ?? '',
            o.items.length,
            (o.shipping_cost ?? 0).toFixed(2),
            o.total_amount.toFixed(2),
            nairobiDay(o.created_at),
          ];
          return csvValues.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',');
        }),
      ];

      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `orders${statusFilter ? `-${statusFilter.toLowerCase()}` : ''}${paymentFilter ? `-${paymentFilter.toLowerCase()}` : ''}-${nairobiDay()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} order${rows.length === 1 ? '' : 's'}.`);
    } catch (err) {
      toast.error(errorMessage(err, 'The export failed. Check your connection and try again.'));
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
                aria-label={`Copy order number ${formatOrderRef(order)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  copyOrderRef(order);
                }}
                className="rounded p-0.5 reveal-on-hover hover:bg-muted"
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
      id: 'source',
      header: 'Source',
      cell: ({ row }) => <SourceChip source={row.original.order_source} />,
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
        return <PaymentStatusChip status={paymentStatus} />;
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
          <span className="block font-semibold tabular-nums">{formatMoney(row.original.total_amount)}</span>
          {row.original.discount_amount > 0 && (
            <span className="text-[11px] tabular-nums text-muted-foreground">−{formatMoney(row.original.discount_amount)} discount</span>
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
            aria-label={`View order ${formatOrderRef(row.original)}`}
            // Keyboard users open the order from the row itself; this is the mouse/touch target.
            tabIndex={-1}
            className="h-8 w-8 px-0 reveal-on-hover"
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
    // Sorted by the server across every order; the table only shows the current page.
    manualSorting: true,
    enableSortingRemoval: false,
    onSortingChange: setSorting,
    state: { sorting },
  });

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-4 sm:p-6">
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
          <div className="flex flex-col items-start gap-3">
            <ErrorNotice>
              {errorMessage(error, 'Orders couldn’t be loaded. Check your connection, then try again.')}
            </ErrorNotice>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
              {isRefetching ? 'Trying again…' : 'Try again'}
            </Button>
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
                  <SelectItem value={ORDER_STATUS.SHIPPED}>Out for delivery</SelectItem>
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
                  <SelectItem value={PAYMENT_STATUS.HELD}>Needs review</SelectItem>
                  <SelectItem value={PAYMENT_STATUS.REVERSED}>Reversed</SelectItem>
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
                {canCreateWalkInSale && (
                  <Button size="sm" onClick={() => setWalkInOpen(true)}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Walk-in sale
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={exportCsv} disabled={isExporting || total === 0}>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  {isExporting ? 'Exporting…' : 'Export CSV'}
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
                  <p className="mt-3 font-medium text-foreground">{empty.title}</p>
                  <p className="mt-1 text-sm">{empty.hint}</p>
                </div>
              )}
            </div>

            <div className="hidden overflow-x-auto rounded-xl border bg-card lg:block">
              <Table className="min-w-[1000px] table-fixed xl:min-w-[1120px] 2xl:min-w-[1600px]">
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
                        // The row is the keyboard path to an order: Tab to it, then Enter or Space.
                        tabIndex={0}
                        aria-label={`Order ${formatOrderRef(row.original)}, ${row.original.shipping_address.full_name || 'guest'}, ${formatMoney(row.original.total_amount)}. Press Enter to open.`}
                        className={cn(
                          'group cursor-pointer hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                          (row.original.status === ORDER_STATUS.CANCELLED || row.original.status === ORDER_STATUS.REFUNDED)
                            && 'bg-muted/30 text-muted-foreground hover:bg-muted/40'
                        )}
                        onClick={() => openOrder(row.original)}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openOrder(row.original);
                          }
                        }}
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
                            <p className="font-medium text-foreground">{empty.title}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{empty.hint}</p>
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
      <WalkInSaleDialog
        open={walkInOpen}
        onOpenChange={setWalkInOpen}
        onCreated={(order) => openOrder(order)}
      />
    </DashboardLayout>
  );
}
