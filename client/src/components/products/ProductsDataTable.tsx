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
import { cn } from '@/lib/utils';

type Product = ProductResponse;
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Boxes, ImageIcon, Package, Pencil, Plus, Star, Tag, Trash2, Upload } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const columnClasses: Record<string, string> = {
  name: 'w-[320px]',
  category_id: 'w-[180px]',
  price: 'w-[160px]',
  total_stock: 'w-[140px]',
  is_active: 'w-[120px]',
  created_at: 'w-[150px]',
  is_featured: 'w-[110px]',
  actions: 'w-[190px]',
};

interface ProductsDataTableProps {
  data: Product[];
  columns: ColumnDef<Product>[];
  onCreateNew?: () => void;
  onImportCsv?: () => void;
  onOpenVariants?: (product: Product) => void;
  onEdit?: (product: Product) => void;
  onSale?: (product: Product) => void;
  onRemove?: (product: Product) => void;
  onToggleFeatured?: (product: Product) => void;
  getCategoryName?: (categoryId: string) => string;
  renderCategory?: (name: string) => React.ReactNode;
  renderStock?: (product: Product) => React.ReactNode;
  renderStatus?: (active: boolean) => React.ReactNode;
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
  onImportCsv,
  onOpenVariants,
  onEdit,
  onSale,
  onRemove,
  onToggleFeatured,
  getCategoryName,
  renderCategory,
  renderStock,
  renderStatus,
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
          className="h-9 w-full sm:max-w-[240px]"
        />
        <span className="ml-auto text-sm text-muted-foreground">
          {total} product{total !== 1 ? 's' : ''}
        </span>
        {onImportCsv && (
          <Button variant="outline" onClick={onImportCsv}>
            <Upload className="h-4 w-4" />
            Import CSV
          </Button>
        )}
        {onCreateNew && (
          <Button onClick={onCreateNew}>
            <Plus className="h-4 w-4" />
            New Product
          </Button>
        )}
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 lg:hidden">
        {data.length ? (
          data.map((product) => {
            const categoryName = getCategoryName?.(product.category_id) ?? product.category_id;
            return (
              <div
                key={product.id}
                className={cn(
                  'rounded-xl border bg-card p-4 shadow-sm',
                  !product.is_active && 'bg-muted/30 text-muted-foreground'
                )}
              >
                <div className="flex gap-3">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-border">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className={cn('h-full w-full object-cover', !product.is_active && 'grayscale opacity-70')}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <ImageIcon className="h-5 w-5" strokeWidth={1.5} />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">{product.name}</p>
                        <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{product.sku}</p>
                      </div>
                      <button
                        type="button"
                        title={product.is_featured ? 'Unfeature' : 'Feature'}
                        onClick={() => onToggleFeatured?.(product)}
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground',
                          product.is_featured && 'text-[var(--color-warning-text)]'
                        )}
                      >
                        <Star className={cn('h-4 w-4', product.is_featured && 'fill-current')} strokeWidth={1.7} />
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {renderCategory ? renderCategory(categoryName) : <span className="text-xs text-muted-foreground">{categoryName}</span>}
                      {renderStatus ? renderStatus(product.is_active) : null}
                      {product.sale_price != null && (
                        <span className="rounded-full bg-[var(--color-warning-bg)] px-2 py-1 text-xs font-semibold text-[var(--color-warning-text)]">
                          Sale
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-border bg-background/60 p-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Price</p>
                    <p className="mt-1 font-semibold tabular-nums text-foreground">
                      KES {(product.sale_price ?? product.price).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-right text-[11px] uppercase tracking-wide text-muted-foreground">Inventory</p>
                    <div className="mt-1">{renderStock?.(product)}</div>
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => onOpenVariants?.(product)} className="flex-1">
                    <Boxes className="h-4 w-4" />
                    Variants
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onEdit?.(product)} title="Edit" className="h-8 w-8 px-0">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onSale?.(product)} title="Sale" className="h-8 w-8 px-0">
                    <Tag className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemove?.(product)}
                    title="Remove"
                    className="h-8 w-8 px-0 hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
            <Package className="mx-auto h-6 w-6" strokeWidth={1.5} />
            <p className="mt-3 font-medium text-foreground">Your catalogue is empty</p>
            <p className="mt-1 text-sm">Add your first product to go live.</p>
            {onCreateNew && <Button onClick={onCreateNew} className="mt-4">Add product</Button>}
          </div>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-xl border bg-card lg:block">
        <Table className="min-w-[1080px] table-fixed">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className={columnClasses[header.column.id]}>
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
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className={cn('group', !row.original.is_active && 'bg-muted/30 text-muted-foreground hover:bg-muted/40')}
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
