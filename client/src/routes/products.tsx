import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useProducts, useDeleteProduct, useToggleFeatured } from '@/hooks/useProducts';
import { useSetProductSale } from '@/hooks/usePromotions';
import { useCategoryOptions } from '@/hooks/useCategories';
import { ProductDialog } from '@/components/products/ProductDialog';
import { ProductsDataTable } from '@/components/products/ProductsDataTable';
import { VariantsSheet } from '@/components/products/VariantsSheet';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import type { ProductResponse, CategoryResponse } from 'shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle, CheckCircle2, ImageIcon, XCircle } from 'lucide-react';

export const Route = createFileRoute('/products')({
  component: ProductsPage,
});

type Product = ProductResponse;

const LIMIT = 20;

function ProductsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [variantsProduct, setVariantsProduct] = useState<Product | null>(null);
  const [variantsSheetOpen, setVariantsSheetOpen] = useState(false);
  const [removeProduct, setRemoveProduct] = useState<Product | null>(null);
  const [saleProduct, setSaleProduct] = useState<Product | null>(null);
  const [saleForm, setSaleForm] = useState({ sale_price: '', sale_ends_at: '' });
  const [saleError, setSaleError] = useState('');
  const [removeResult, setRemoveResult] = useState<{
    action: 'deleted' | 'deactivated' | 'error';
    message: string;
  } | null>(null);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const { data: res, isLoading, error } = useProducts({
    search: debouncedSearch || undefined,
    page,
    limit: LIMIT,
  });

  const products: Product[] = (res?.data as Product[]) ?? [];
  const total = (res as any)?.pagination?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const { data: categories } = useCategoryOptions();
  const deleteMutation = useDeleteProduct();
  const toggleFeaturedMutation = useToggleFeatured();
  const setProductSaleMutation = useSetProductSale();

  const handleCreate = () => {
    setEditingProduct(null);
    setDialogOpen(true);
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setDialogOpen(true);
  };

  const handleOpenVariants = (product: Product) => {
    setVariantsProduct(product);
    setVariantsSheetOpen(true);
  };

  const handleRemoveClick = (product: Product) => {
    setRemoveProduct(product);
    setRemoveResult(null);
  };

  const handleSaleClick = (product: Product) => {
    setSaleProduct(product);
    setSaleForm({
      sale_price: product.sale_price != null ? String(product.sale_price) : '',
      sale_ends_at: product.sale_ends_at ? product.sale_ends_at.slice(0, 10) : '',
    });
    setSaleError('');
  };

  const submitSale = async () => {
    if (!saleProduct) return;
    const salePrice = Number(saleForm.sale_price);
    if (!Number.isFinite(salePrice) || salePrice < 0) {
      setSaleError('Sale price must be a non-negative number.');
      return;
    }
    if (salePrice >= saleProduct.price) {
      setSaleError('Sale price must be lower than the regular price.');
      return;
    }

    try {
      await setProductSaleMutation.mutateAsync({
        id: saleProduct.id,
        data: {
          sale_price: salePrice,
          sale_ends_at: saleForm.sale_ends_at ? new Date(saleForm.sale_ends_at).toISOString() : null,
        },
      });
      setSaleProduct(null);
    } catch (error: any) {
      setSaleError(error?.message || 'Failed to update sale');
    }
  };

  const removeSale = async () => {
    if (!saleProduct) return;
    try {
      await setProductSaleMutation.mutateAsync({ id: saleProduct.id, data: { sale_price: null } });
      setSaleProduct(null);
    } catch (error: any) {
      setSaleError(error?.message || 'Failed to remove sale');
    }
  };

  const closeRemoveDialog = () => {
    if (deleteMutation.isPending) return;
    setRemoveProduct(null);
    setRemoveResult(null);
  };

  const confirmRemoveProduct = async () => {
    if (!removeProduct) return;

    try {
      const result = await deleteMutation.mutateAsync(removeProduct.id);
      if (result.data?.action === 'deactivated') {
        setRemoveResult({
          action: 'deactivated',
          message: `"${removeProduct.name}" has order history, so it was deactivated instead of permanently deleted.`,
        });
      } else {
        setRemoveResult({
          action: 'deleted',
          message: `"${removeProduct.name}" was permanently deleted.`,
        });
      }
    } catch (error: unknown) {
      const errorMessage = (error as { message?: string })?.message || 'Failed to delete product';
      setRemoveResult({
        action: 'error',
        message: errorMessage,
      });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
    }).format(price);
  };

  const getCategoryName = (categoryId: string) => {
    const category = categories?.find((c: CategoryResponse) => c.id === String(categoryId));
    return category?.name || '—';
  };

  const columns: ColumnDef<Product>[] = [
    {
      accessorKey: 'image_url',
      header: 'Image',
      cell: ({ row }) => {
        const product = row.original;
        return (
          <div className="h-12 w-12 overflow-hidden rounded-lg bg-muted">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <ImageIcon className="h-5 w-5" strokeWidth={1.5} />
              </div>
            )}
          </div>
        );
      },
    },
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
        const product = row.original;
        return <div className="font-medium">{product.name}</div>;
      },
    },
    {
      accessorKey: 'category_id',
      header: 'Category',
      cell: ({ row }) => {
        const product = row.original;
        return (
          <Badge variant="neutral">
            {getCategoryName(product.category_id)}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'price',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="-ml-4"
          >
            Price
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
        const product = row.original;
        return (
          <div className="text-right font-medium tabular-nums">
            {product.sale_price != null ? (
              <div>
                <span>{formatPrice(product.sale_price)}</span>
                <span className="ml-2 text-xs text-muted-foreground line-through">{formatPrice(product.price)}</span>
              </div>
            ) : (
              formatPrice(product.price)
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'total_stock',
      header: 'Stock',
      cell: ({ row }) => {
        const product = row.original;
        const stockLevel = product.total_stock ?? product.stock;
        let stockColor = 'text-[var(--color-success-text)]';
        if (stockLevel === 0) {
          stockColor = 'text-[var(--color-danger-text)]';
        } else if (stockLevel < 10) {
          stockColor = 'text-[var(--color-warning-text)]';
        }
        return <span className={`block text-right font-medium tabular-nums ${stockColor}`}>{stockLevel}</span>;
      },
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      cell: ({ row }) => {
        const product = row.original;
        return (
          <Badge variant={product.is_active ? 'success' : 'neutral'}>
            {product.is_active ? 'active' : 'inactive'}
          </Badge>
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
        const product = row.original;
        return (
          <div className="text-sm text-muted-foreground">
            {formatDate(product.created_at)}
          </div>
        );
      },
    },
    {
      id: 'is_featured',
      header: 'Featured',
      cell: ({ row }) => {
        const product = row.original;
        return (
          <button
            title={product.is_featured ? 'Unfeature' : 'Feature'}
            onClick={() => toggleFeaturedMutation.mutate({ id: product.id, is_featured: !product.is_featured })}
            disabled={toggleFeaturedMutation.isPending}
            className={`text-xl leading-none transition-colors ${
              product.is_featured ? 'text-[var(--color-warning-text)]' : 'text-muted-foreground hover:text-[var(--color-warning-text)]'
            }`}
          >
            ★
          </button>
        );
      },
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const product = row.original;
        return (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenVariants(product)}
            >
              Variants
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleEdit(product)}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleSaleClick(product)}
            >
              Sale
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleRemoveClick(product)}
              disabled={deleteMutation.isPending}
              className="hover:bg-destructive/10 hover:text-destructive"
            >
              Remove
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold leading-tight">Products</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage your product inventory and listings
            </p>
          </div>
        </div>

        {isLoading && (
          <div className="rounded-xl border bg-card p-6">
            <div className="flex flex-col items-center gap-3">
              <div className="skeleton h-8 w-32" />
              <div className="skeleton h-4 w-48" />
              <p className="text-sm text-muted-foreground">Loading products...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4">
            <p className="text-sm font-medium text-destructive">Failed to load products</p>
            <p className="text-sm text-destructive/80 mt-1">
              {(error as { message?: string })?.message || 'An error occurred'}
            </p>
          </div>
        )}

        {!isLoading && !error && (
          <ProductsDataTable
            data={products}
            columns={columns}
            onCreateNew={handleCreate}
            searchValue={search}
            onSearchChange={setSearch}
            page={page}
            totalPages={totalPages}
            total={total}
            onPageChange={setPage}
          />
        )}
      </div>

      <ProductDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        product={editingProduct}
      />

      <VariantsSheet
        open={variantsSheetOpen}
        onOpenChange={setVariantsSheetOpen}
        product={variantsProduct}
      />

      <Dialog open={!!saleProduct} onOpenChange={(open) => { if (!open) setSaleProduct(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Flash sale</DialogTitle>
            <DialogDescription>
              {saleProduct ? `Set a sale price for "${saleProduct.name}". Variant price overrides still take priority.` : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium">Sale price</label>
              <input
                type="number"
                min="0"
                value={saleForm.sale_price}
                onChange={(e) => setSaleForm((f) => ({ ...f, sale_price: e.target.value }))}
                className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
                placeholder={saleProduct ? String(saleProduct.price) : ''}
              />
            </div>
            <div>
              <label className="text-xs font-medium">Ends at</label>
              <input
                type="date"
                value={saleForm.sale_ends_at}
                onChange={(e) => setSaleForm((f) => ({ ...f, sale_ends_at: e.target.value }))}
                className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
              />
            </div>
            {saleError && (
              <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {saleError}
              </p>
            )}
          </div>

          <DialogFooter>
            {saleProduct?.sale_price != null && (
              <Button variant="outline" onClick={removeSale} disabled={setProductSaleMutation.isPending}>
                Remove Sale
              </Button>
            )}
            <Button onClick={submitSale} disabled={setProductSaleMutation.isPending || !saleForm.sale_price}>
              {setProductSaleMutation.isPending ? 'Saving...' : 'Save Sale'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!removeProduct} onOpenChange={(open) => { if (!open) closeRemoveDialog(); }}>
        <DialogContent className="sm:max-w-md">
          {!removeResult ? (
            <>
              <DialogHeader>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                  <AlertTriangle className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <DialogTitle>Remove product?</DialogTitle>
                <DialogDescription>
                  {removeProduct ? `You are about to remove "${removeProduct.name}" from the catalogue.` : ''}
                </DialogDescription>
              </DialogHeader>

              <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">What happens next</p>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  <li>If this product has never been ordered, it will be permanently deleted.</li>
                  <li>If it appears in any order history, it will be deactivated instead so past orders stay intact.</li>
                </ul>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeRemoveDialog} disabled={deleteMutation.isPending}>
                  Cancel
                </Button>
                <Button type="button" variant="destructive" onClick={confirmRemoveProduct} disabled={deleteMutation.isPending}>
                  {deleteMutation.isPending ? 'Removing...' : 'Remove product'}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <div
                  className={`mb-2 flex h-10 w-10 items-center justify-center rounded-full ${
                    removeResult.action === 'error'
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]'
                  }`}
                >
                  {removeResult.action === 'error' ? (
                    <XCircle className="h-5 w-5" strokeWidth={1.5} />
                  ) : (
                    <CheckCircle2 className="h-5 w-5" strokeWidth={1.5} />
                  )}
                </div>
                <DialogTitle>
                  {removeResult.action === 'error'
                    ? 'Unable to remove product'
                    : removeResult.action === 'deactivated'
                    ? 'Product deactivated'
                    : 'Product deleted'}
                </DialogTitle>
                <DialogDescription>{removeResult.message}</DialogDescription>
              </DialogHeader>

              <DialogFooter>
                <Button type="button" onClick={closeRemoveDialog}>
                  Done
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
