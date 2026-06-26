import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect, useCallback } from 'react';
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
import { Badge } from '@/components/ui/badge';
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
import { ClipboardList, Download } from 'lucide-react';
import { ORDER_STATUS, PAYMENT_STATUS } from 'shared';
import type { OrderResponse, OrderStatus, PaymentStatus } from 'shared';

export const Route = createFileRoute('/orders')({
  component: OrdersPage,
});

const LIMIT = 20;

const STATUS_VARIANTS: Record<OrderStatus, React.ComponentProps<typeof Badge>['variant']> = {
  PENDING: 'warning',
  CONFIRMED: 'info',
  PROCESSING: 'info',
  SHIPPED: 'info',
  DELIVERED: 'success',
  CANCELLED: 'danger',
  REFUNDED: 'neutral',
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function OrdersPage() {
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

      const headers = ['Order ID', 'Status', 'Payment', 'Items', 'Shipping (KES)', 'Total (KES)', 'Date'];
      const lines = [
        headers.join(','),
        ...rows.map((o) => [
          `#${o.id.slice(-8).toUpperCase()}`,
          o.status,
          (o as any).payment_status ?? '',
          o.items.length,
          ((o as any).shipping_cost ?? 0).toFixed(2),
          o.total_amount.toFixed(2),
          new Date(o.created_at).toISOString().slice(0, 10),
        ].join(',')),
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
      header: 'Order',
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          #{row.original.id.slice(-8).toUpperCase()}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANTS[row.original.status]}>
          {row.original.status.toLowerCase()}
        </Badge>
      ),
    },
    {
      accessorKey: 'payment_status',
      header: 'Payment',
      cell: ({ row }) => {
        const paymentStatus = (row.original as any).payment_status ?? PAYMENT_STATUS.UNPAID;
        return (
          <Badge variant={paymentStatus === PAYMENT_STATUS.PAID ? 'success' : paymentStatus === PAYMENT_STATUS.FAILED ? 'danger' : 'warning'}>
            {paymentStatus.toLowerCase()}
          </Badge>
        );
      },
    },
    {
      id: 'items',
      header: 'Items',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.items.length} item{row.original.items.length !== 1 ? 's' : ''}
        </span>
      ),
    },
    {
      accessorKey: 'total_amount',
      header: 'Total',
      cell: ({ row }) => (
        <span className="block text-right font-medium tabular-nums">KES {row.original.total_amount.toFixed(2)}</span>
      ),
    },
    {
      accessorKey: 'created_at',
      header: 'Date',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.original.created_at)}</span>
      ),
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openOrder(row.original); }}>
            View
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
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value={ORDER_STATUS.PENDING}>Pending</SelectItem>
                  <SelectItem value={ORDER_STATUS.CONFIRMED}>Confirmed</SelectItem>
                  <SelectItem value={ORDER_STATUS.PROCESSING}>Processing</SelectItem>
                  <SelectItem value={ORDER_STATUS.SHIPPED}>Shipped</SelectItem>
                  <SelectItem value={ORDER_STATUS.DELIVERED}>Delivered</SelectItem>
                  <SelectItem value={ORDER_STATUS.CANCELLED}>Cancelled</SelectItem>
                  <SelectItem value={ORDER_STATUS.REFUNDED}>Refunded</SelectItem>
                </SelectContent>
              </Select>
              <Select value={paymentFilter} onValueChange={(v) => setPaymentFilter(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-44">
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
              <div className="ml-auto flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {total} order{total !== 1 ? 's' : ''}
                </span>
                <Button variant="outline" size="sm" onClick={exportCsv} disabled={isExporting || total === 0}>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  {isExporting ? 'Exporting...' : 'Export CSV'}
                </Button>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((hg) => (
                    <TableRow key={hg.id}>
                      {hg.headers.map((h) => (
                        <TableHead key={h.id}>
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
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => openOrder(row.original)}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
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

      <OrderSheet order={selectedOrder} open={sheetOpen} onOpenChange={setSheetOpen} />
    </DashboardLayout>
  );
}
