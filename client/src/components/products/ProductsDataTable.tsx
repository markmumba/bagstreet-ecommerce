import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useState } from 'react';
import type { ProductResponse } from 'shared';

type Product = ProductResponse;
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Package, Plus } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface ProductsDataTableProps {
  data: Product[];
  columns: ColumnDef<Product>[];
  onCreateNew?: () => void;
  // Server-side search
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  // Server-side pagination
  page?: number;
  totalPages?: number;
  total?: number;
  onPageChange?: (page: number) => void;
}

export function ProductsDataTable({
  data,
  columns,
  onCreateNew,
  searchValue = '',
  onSearchChange,
  page = 1,
  totalPages = 1,
  total = 0,
  onPageChange,
}: ProductsDataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
    manualPagination: true,
  });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search products..."
          value={searchValue}
          onChange={(e) => onSearchChange?.(e.target.value)}
          className="h-9 w-full max-w-[240px]"
        />
        <span className="ml-auto text-sm text-muted-foreground">
          {total} product{total !== 1 ? 's' : ''}
        </span>
        {onCreateNew && (
          <Button onClick={onCreateNew}>
            <Plus className="h-4 w-4" />
            New Product
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
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
                    <Package className="h-6 w-6" strokeWidth={1.5} />
                    <div>
                      <p className="font-medium text-foreground">Your catalogue is empty</p>
                      <p className="mt-1 text-sm text-muted-foreground">Add your first product to go live.</p>
                    </div>
                    {onCreateNew && <Button onClick={onCreateNew}>Add product</Button>}
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
          Page {page} of {totalPages} · {total} product{total !== 1 ? 's' : ''}
        </p>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange?.(page - 1)}
            disabled={page <= 1}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange?.(page + 1)}
            disabled={page >= totalPages}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
