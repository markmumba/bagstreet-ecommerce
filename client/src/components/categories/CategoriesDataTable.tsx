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
import { Pencil, Plus, Tag, Trash2, Upload } from 'lucide-react';
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
  onImportCsv?: () => void;
  // server-side controls
  search: string;
  onSearchChange: (v: string) => void;
  total: number;
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  onEdit?: (category: Category) => void;
  onDelete?: (category: Category) => void;
  isDeleting?: boolean;
}

export function CategoriesDataTable({
  data,
  columns,
  onCreateNew,
  onImportCsv,
  search,
  onSearchChange,
  total,
  page,
  totalPages,
  onPageChange,
  onEdit,
  onDelete,
  isDeleting = false,
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
        {onImportCsv && (
          <Button variant="outline" onClick={onImportCsv}>
            <Upload className="h-4 w-4" />
            Import CSV
          </Button>
        )}
        {onCreateNew && (
          <Button onClick={onCreateNew}>
            <Plus className="h-4 w-4" />
            New Category
          </Button>
        )}
      </div>

      <div className="space-y-3 lg:hidden">
        {data.length > 0 ? (
          data.map((category) => {
            const cat = category as Category & { parent_name?: string | null; children_count?: number };
            return (
              <div key={category.id} className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Tag className="h-4 w-4" strokeWidth={1.7} />
                      </span>
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-foreground">{category.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {cat.parent_name ? `Under ${cat.parent_name}` : 'Top-level category'}
                        </p>
                      </div>
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                      {category.description || 'No description added yet.'}
                    </p>
                  </div>
                  <div className="rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {cat.children_count ?? 0} sub
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3">
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {new Date(category.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                  <div className="flex gap-2">
                    {onEdit && (
                      <Button variant="outline" size="icon" onClick={() => onEdit(category)} aria-label={`Edit ${category.name}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {onDelete && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => onDelete(category)}
                        disabled={isDeleting}
                        className="hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Delete ${category.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
            <div className="flex flex-col items-center gap-3">
              <Tag className="h-6 w-6" strokeWidth={1.5} />
              <div>
                <p className="font-medium text-foreground">No categories yet</p>
                <p className="mt-1 text-sm text-muted-foreground">Create a category to organize your catalogue.</p>
              </div>
              {onCreateNew && <Button onClick={onCreateNew}>Add category</Button>}
            </div>
          </div>
        )}
      </div>

      <div className="hidden overflow-hidden rounded-xl border bg-card lg:block">
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
