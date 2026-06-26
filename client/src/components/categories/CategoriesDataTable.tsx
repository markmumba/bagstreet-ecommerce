import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useState } from 'react';
import type { Category } from 'shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Tag } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface CategoriesDataTableProps {
  data: Category[];
  columns: ColumnDef<Category>[];
  onCreateNew?: () => void;
  // server-side controls
  search: string;
  onSearchChange: (v: string) => void;
  total: number;
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}

export function CategoriesDataTable({
  data,
  columns,
  onCreateNew,
  search,
  onSearchChange,
  total,
  page,
  totalPages,
  onPageChange,
}: CategoriesDataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search categories..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-9 w-full max-w-[240px]"
        />
        <span className="ml-auto text-sm text-muted-foreground">
          {total} categor{total === 1 ? 'y' : 'ies'}
        </span>
        {onCreateNew && (
          <Button onClick={onCreateNew}>
            <Plus className="h-4 w-4" />
            New Category
          </Button>
        )}
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
                <TableRow key={row.id}>
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
                    <Tag className="h-6 w-6" strokeWidth={1.5} />
                    <div>
                      <p className="font-medium text-foreground">No categories yet</p>
                      <p className="mt-1 text-sm text-muted-foreground">Create a category to organize your catalogue.</p>
                    </div>
                    {onCreateNew && <Button onClick={onCreateNew}>Add category</Button>}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground tabular-nums">
          Page {page} of {totalPages} · {total} total
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
            Previous
          </Button>
          <Button variant="outline" size="sm" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
