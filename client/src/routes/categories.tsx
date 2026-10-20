import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useCategories, useCategoryOptions, useDeleteCategory, useImportCategoriesCsv } from '@/hooks/useCategories';
import { useCategoryPairings } from '@/hooks/useRecommendations';
import { CategoryPairingsDialog } from '@/components/categories/CategoryPairingsDialog';
import { Link2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CategoryDialog } from '@/components/categories/CategoryDialog';
import { CategoriesDataTable } from '@/components/categories/CategoriesDataTable';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { CsvImportDialog } from '@/components/import/CsvImportDialog';
import type { CategoryResponse } from 'shared';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/format';
import { ErrorNotice, errorMessage } from '@/components/ui/notice';

export const Route = createFileRoute('/categories')({
  component: CategoriesPage,
});

const LIMIT = 50;

function CategoriesPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CategoryResponse | null>(null);

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

  const categories = res?.items ?? [];
  const total = res?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const deleteMutation = useDeleteCategory();
  const { data: allCategories = [] } = useCategoryOptions();
  const { data: pairingsData, error: pairingsError } = useCategoryPairings();
  const [pairingTarget, setPairingTarget] = useState<CategoryResponse | null>(null);

  const topLevel = allCategories.filter((c) => !c.parent_id);
  const nameById = new Map(allCategories.map((c) => [c.id, c.name]));
  const pairedIds = (categoryId: string) =>
    pairingsData?.pairings.find((p) => p.category_id === categoryId)?.paired_category_ids ?? [];

  /** "Goes with" chips and an edit button; subcategories use their top-level category's pairings. */
  const renderGoesWith = (cat: CategoryResponse) => {
    if (cat.parent_id) return null;
    const names = pairedIds(cat.id).map((id) => nameById.get(id)).filter(Boolean) as string[];
    return (
      <div className="group flex min-w-0 flex-wrap items-center gap-1.5">
        {names.length ? (
          names.map((name) => (
            <span key={name} className="rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium">
              {name}
            </span>
          ))
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPairingTarget(cat)}
          disabled={!pairingsData}
          title="Edit what goes with this category"
          aria-label={`Choose categories that go with ${cat.name}`}
          className="h-7 w-7 px-0 reveal-on-hover"
        >
          <Link2 className="h-4 w-4" />
        </Button>
      </div>
    );
  };
  const importMutation = useImportCategoriesCsv();

  const handleCreate = () => {
    setEditingCategory(null);
    setDialogOpen(true);
  };

  const handleEdit = (category: CategoryResponse) => {
    setEditingCategory(category);
    setDialogOpen(true);
  };

  const handleDelete = (category: CategoryResponse) => {
    setDeleteTarget(category);
  };

  const columns: ColumnDef<CategoryResponse>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} className="-ml-4">
          Name
          <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
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
        const cat = row.original;
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
        const cat = row.original;
        return (
          <div className="text-sm text-muted-foreground">
            {cat.children_count ?? 0}
          </div>
        );
      },
    },
    {
      id: 'goes_with',
      header: 'Goes with',
      cell: ({ row }) => renderGoesWith(row.original) ?? <span className="sr-only">Uses its parent’s pairings</span>,
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} className="-ml-4">
          Created
          <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
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
      <div className="flex flex-col gap-6 p-4 sm:p-6">
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
              <p className="text-sm text-muted-foreground">Loading categories…</p>
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

        {pairingsError && (
          <ErrorNotice>{errorMessage(pairingsError, 'Could not load which categories go together. Refresh the page to try again.')}</ErrorNotice>
        )}

        {!isLoading && !error && (
          <CategoriesDataTable
            renderExtra={(cat) => {
              const content = renderGoesWith(cat);
              return content && (
                <div className="mt-3 border-t pt-3">
                  <p className="mb-1.5 text-xs text-muted-foreground">Goes with</p>
                  {content}
                </div>
              );
            }}
            data={categories}
            columns={columns}
            onCreateNew={handleCreate}
            onImportCsv={() => setImportOpen(true)}
            search={search}
            onSearchChange={setSearch}
            total={total}
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            onEdit={handleEdit}
            onDelete={handleDelete}
            isDeleting={deleteMutation.isPending}
          />
        )}
      </div>

      <CategoryDialog open={dialogOpen} onOpenChange={setDialogOpen} category={editingCategory} />
      <CsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import categories"
        description="Upload categories in CSV format. Parent categories must already exist or appear earlier in the same import."
        templateFilename="bagstreet-categories-template.csv"
        templateCsv={'name,description,parent_name\nHandbags,All handbag products,\nCrossbody Bags,Small crossbody bags,Handbags\n'}
        onImport={async (file) => {
          return importMutation.mutateAsync(file);
        }}
      />
      <CategoryPairingsDialog
        category={pairingTarget}
        topLevel={topLevel}
        current={pairingTarget ? pairedIds(pairingTarget.id) : []}
        onClose={() => setPairingTarget(null)}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete category?"
        description={<>This permanently deletes “{deleteTarget?.name}”. A category that still has products or subcategories can’t be deleted: move them first.</>}
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        destructive
        onConfirm={() => deleteMutation.mutateAsync(deleteTarget!.id)}
      />
    </DashboardLayout>
  );
}
