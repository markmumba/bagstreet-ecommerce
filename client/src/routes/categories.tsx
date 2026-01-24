import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
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

function CategoriesPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const { data: categories, isLoading, error } = useCategories();
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
    if (!window.confirm(`Delete "${category.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(category.id);
    } catch (error: unknown) {
      const errorMessage = (error as { message?: string })?.message || 'Failed to delete category';
      alert(errorMessage);
    }
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Define table columns (rendering-hoist-jsx - extracted outside component for performance)
  const columns: ColumnDef<Category>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="-ml-4"
          >
            Name
            <svg
              className="ml-2 h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
              />
            </svg>
          </Button>
        );
      },
      cell: ({ row }) => {
        const category = row.original;
        return <div className="font-medium">{category.name}</div>;
      },
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => {
        const category = row.original;
        return (
          <div className="max-w-md text-muted-foreground">
            {category.description || (
              <span className="italic text-muted-foreground/60">No description</span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="-ml-4"
          >
            Created
            <svg
              className="ml-2 h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
              />
            </svg>
          </Button>
        );
      },
      cell: ({ row }) => {
        const category = row.original;
        return (
          <div className="text-sm text-muted-foreground">
            {formatDate(category.created_at)}
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const category = row.original;
        return (
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleEdit(category)}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDelete(category)}
              disabled={deleteMutation.isPending}
              className="hover:bg-destructive/10 hover:text-destructive"
            >
              Delete
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Categories</h1>
            <p className="text-muted-foreground mt-1">
              Manage product categories and organize your inventory
            </p>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center p-12 border rounded-lg">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
              <p className="text-sm text-muted-foreground">Loading categories...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="p-4 border border-destructive/50 bg-destructive/10 rounded-lg">
            <p className="text-sm font-medium text-destructive">Failed to load categories</p>
            <p className="text-sm text-destructive/80 mt-1">
              {(error as { message?: string })?.message || 'An error occurred'}
            </p>
          </div>
        )}

        {/* Data Table */}
        {!isLoading && !error && categories && (
          <CategoriesDataTable
            data={categories}
            columns={columns}
            onCreateNew={handleCreate}
          />
        )}
      </div>

      {/* Dialog */}
      <CategoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        category={editingCategory}
      />
    </DashboardLayout>
  );
}
