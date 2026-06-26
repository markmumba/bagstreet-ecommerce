import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useCategories, useDeleteCategory } from '@/hooks/useCategories';
import { CategoryDialog } from '@/components/categories/CategoryDialog';
import { CategoriesDataTable } from '@/components/categories/CategoriesDataTable';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import type { Category } from 'shared';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/categories')({
  component: CategoriesPage,
});

const LIMIT = 50;

function CategoriesPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // Server-side filter state
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const { data: res, isLoading, error } = useCategories({
    page,
    limit: LIMIT,
    search: debouncedSearch || undefined,
  });

  const categories = (res?.data as any[]) ?? [];
  const total = (res as any)?.pagination?.total ?? categories.length;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const deleteMutation = useDeleteCategory();

  const handleCreate = () => {
    setEditingCategory(null);
    setDialogOpen(true);
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setDialogOpen(true);
  };

  const handleDelete = async (category: Category) => {
    if (!window.confirm(`Delete "${category.name}"? This action cannot be undone.`)) return;
    try {
      await deleteMutation.mutateAsync(category.id);
    } catch (error: unknown) {
      alert((error as { message?: string })?.message || 'Failed to delete category');
    }
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const columns: ColumnDef<Category>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} className="-ml-4">
          Name
          <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        </Button>
      ),
      cell: ({ row }) => <div className="font-medium">{row.original.name}</div>,
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => (
        <div className="max-w-md text-muted-foreground">
          {row.original.description || <span className="italic text-muted-foreground/60">No description</span>}
        </div>
      ),
    },
    {
      id: 'parent',
      header: 'Parent',
      cell: ({ row }) => {
        const cat = row.original as any;
        return (
          <div className="text-sm text-muted-foreground">
            {cat.parent_name ?? <span className="italic text-muted-foreground/60">—</span>}
          </div>
        );
      },
    },
    {
      id: 'children_count',
      header: 'Subcategories',
      cell: ({ row }) => {
        const cat = row.original as any;
        return (
          <div className="text-sm text-muted-foreground">
            {cat.children_count ?? 0}
          </div>
        );
      },
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} className="-ml-4">
          Created
          <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        </Button>
      ),
      cell: ({ row }) => (
        <div className="text-sm text-muted-foreground">{formatDate(row.original.created_at)}</div>
      ),
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => handleEdit(row.original)}>Edit</Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDelete(row.original)}
            disabled={deleteMutation.isPending}
            className="hover:bg-destructive/10 hover:text-destructive"
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold leading-tight">Categories</h1>
            <p className="mt-1 text-sm text-muted-foreground">Manage product categories and organize your inventory</p>
          </div>
        </div>

        {isLoading && (
          <div className="rounded-xl border bg-card p-6">
            <div className="flex flex-col items-center gap-3">
              <div className="skeleton h-8 w-32" />
              <div className="skeleton h-4 w-48" />
              <p className="text-sm text-muted-foreground">Loading categories...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4">
            <p className="text-sm font-medium text-destructive">Failed to load categories</p>
            <p className="text-sm text-destructive/80 mt-1">
              {(error as { message?: string })?.message || 'An error occurred'}
            </p>
          </div>
        )}

        {!isLoading && !error && (
          <CategoriesDataTable
            data={categories}
            columns={columns}
            onCreateNew={handleCreate}
            search={search}
            onSearchChange={setSearch}
            total={categories.length}
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        )}
      </div>

      <CategoryDialog open={dialogOpen} onOpenChange={setDialogOpen} category={editingCategory} />
    </DashboardLayout>
  );
}
