import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useProducts, useDeleteProduct, useToggleFeatured, useImportProductsCsv } from '@/hooks/useProducts';
import { useSetProductSale } from '@/hooks/usePromotions';
import { useCategoryOptions } from '@/hooks/useCategories';
import { ProductDialog } from '@/components/products/ProductDialog';
import { ProductsDataTable } from '@/components/products/ProductsDataTable';
import { VariantsSheet } from '@/components/products/VariantsSheet';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { CsvImportDialog } from '@/components/import/CsvImportDialog';
import type { ProductResponse, CategoryResponse } from 'shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle, ArrowUpDown, Boxes, Check, CheckCircle2, Copy, ImageIcon, MoreHorizontal, Pencil, Star, Tag, Trash2, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/products')({
  component: ProductsPage,
});

type Product = ProductResponse;

const LIMIT = 20;
const CATEGORY_STYLES: Record<string, { dot: string; label: string }> = {
  Handbags: { dot: 'bg-[#9f3f46]', label: 'text-[#6f2c31]' },
  Shoes: { dot: 'bg-[#7f5af0]', label: 'text-[#5940a8]' },
  Scarves: { dot: 'bg-[#0f9f6e]', label: 'text-[#08724f]' },
  Accessories: { dot: 'bg-[#64748b]', label: 'text-[#475569]' },
};

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

function CategoryChip({ name }: { name: string }) {
  const style = CATEGORY_STYLES[name] ?? { dot: 'bg-muted-foreground', label: 'text-foreground' };
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium">
      <span className={cn('h-2 w-2 shrink-0 rounded-full', style.dot)} />
      <span className={cn('truncate', style.label)}>{name}</span>
    </span>
  );
}

function StatusIndicator({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium',
        active
          ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]'
          : 'bg-muted text-muted-foreground'
      )}
    >
      {active ? <Check className="h-3 w-3" strokeWidth={2} /> : <X className="h-3 w-3" strokeWidth={2} />}
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function StockIndicator({ product }: { product: Product }) {
  const stockLevel = product.total_stock ?? product.stock;
  const stockStatus = product.stock_status ?? (stockLevel === 0 ? 'out' : stockLevel < 10 ? 'low' : 'high');
  const isAttention = stockStatus === 'out' || stockStatus === 'low';
  const variantNote = product.out_of_stock_variant_count
    ? `${product.out_of_stock_variant_count} out`
    : product.low_stock_variant_count
    ? `${product.low_stock_variant_count} low`
    : 'healthy';

  return (
    <div className="flex items-center justify-end gap-3">
      <div className="min-w-0 text-right">
        <div className={cn('font-medium tabular-nums', isAttention ? 'text-[var(--color-danger-text)]' : 'text-foreground')}>
          {stockLevel}
        </div>
        <div className="text-[11px] text-muted-foreground">{variantNote}</div>
      </div>
      <span
        className={cn(
          'h-2.5 w-2.5 shrink-0 rounded-full ring-4',
          isAttention
            ? 'bg-[var(--color-danger-text)] ring-[var(--color-danger-bg)]'
            : 'bg-[var(--color-success-text)] ring-[var(--color-success-bg)]'
        )}
        title={isAttention ? 'Needs stock attention' : 'Stock healthy'}
      />
    </div>
  );
}

function ProductsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
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
  const [copiedSku, setCopiedSku] = useState<string | null>(null);

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
  const importMutation = useImportProductsCsv();
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

  const handleCopySku = async (sku: string) => {
    try {
      await navigator.clipboard?.writeText(sku);
      setCopiedSku(sku);
      window.setTimeout(() => {
        setCopiedSku((current) => (current === sku ? null : current));
      }, 1600);
    } catch {
      setCopiedSku(null);
    }
  };

  const columns: ColumnDef<Product>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) => <SortHeader column={column} label="Product" />,
      cell: ({ row }) => {
        const product = row.original;
        const isCopied = copiedSku === product.sku;
        return (
          <div className="group flex min-w-0 items-center gap-3">
            <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border">
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
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium text-foreground">{product.name}</span>
                {product.sale_price != null && (
                  <span className="shrink-0 rounded-full bg-[var(--color-warning-bg)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-warning-text)]">
                    Sale
                  </span>
                )}
              </div>
              <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="truncate font-mono">{product.sku}</span>
                <button
                  type="button"
                  title={isCopied ? 'SKU copied' : 'Copy SKU'}
                  aria-label={isCopied ? `Copied ${product.sku}` : `Copy SKU ${product.sku}`}
                  onClick={() => handleCopySku(product.sku)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded px-1 py-0.5 transition-all hover:bg-muted focus:opacity-100',
                    isCopied
                      ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)] opacity-100'
                      : 'opacity-0 group-hover:opacity-100'
                  )}
                >
                  {isCopied ? (
                    <>
                      <Check className="h-3 w-3" strokeWidth={2} />
                      <span className="text-[10px] font-medium">Copied</span>
                    </>
                  ) : (
                    <Copy className="h-3 w-3" strokeWidth={1.8} />
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'category_id',
      header: 'Category',
      cell: ({ row }) => {
        const product = row.original;
        return <CategoryChip name={getCategoryName(product.category_id)} />;
      },
    },
    {
      accessorKey: 'price',
      header: ({ column }) => <SortHeader column={column} label="Price" className="ml-auto" />,
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
      header: () => <div className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inventory</div>,
      cell: ({ row }) => {
        return <StockIndicator product={row.original} />;
      },
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      cell: ({ row }) => {
        return <StatusIndicator active={row.original.is_active} />;
      },
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => <SortHeader column={column} label="Created" />,
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
      header: () => <div className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Feature</div>,
      cell: ({ row }) => {
        const product = row.original;
        return (
          <button
            title={product.is_featured ? 'Unfeature' : 'Feature'}
            onClick={() => toggleFeaturedMutation.mutate({ id: product.id, is_featured: !product.is_featured })}
            disabled={toggleFeaturedMutation.isPending}
            className={cn(
              'mx-auto flex h-8 w-8 items-center justify-center rounded-md transition-colors',
              product.is_featured
                ? 'text-[var(--color-warning-text)]'
                : 'text-muted-foreground opacity-35 hover:bg-muted hover:text-[var(--color-warning-text)] hover:opacity-100'
            )}
          >
            <Star className={cn('h-4 w-4', product.is_featured && 'fill-current')} strokeWidth={1.7} />
          </button>
        );
      },
    },
    {
      id: 'actions',
      header: () => <div className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</div>,
      cell: ({ row }) => {
        const product = row.original;
        return (
          <div className="group/actions flex min-w-[174px] justify-end gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenVariants(product)}
              className="h-8"
            >
              <Boxes className="h-4 w-4" />
              Variants
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleEdit(product)}
              title="Edit"
              className="h-8 w-8 px-0 opacity-0 transition-opacity group-hover:opacity-100 group-hover/actions:opacity-100 focus:opacity-100"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleSaleClick(product)}
              title="Sale"
              className="h-8 w-8 px-0 opacity-0 transition-opacity group-hover:opacity-100 group-hover/actions:opacity-100 focus:opacity-100"
            >
              <Tag className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleRemoveClick(product)}
              disabled={deleteMutation.isPending}
              title="Remove"
              className="h-8 w-8 px-0 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 group-hover/actions:opacity-100 focus:opacity-100"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <span className="flex h-8 w-8 items-center justify-center text-muted-foreground transition-opacity group-hover:hidden group-hover/actions:hidden">
              <MoreHorizontal className="h-4 w-4" strokeWidth={1.7} />
            </span>
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
            onImportCsv={() => setImportOpen(true)}
            onOpenVariants={handleOpenVariants}
            onEdit={handleEdit}
            onSale={handleSaleClick}
            onRemove={handleRemoveClick}
            onToggleFeatured={(product) => toggleFeaturedMutation.mutate({ id: product.id, is_featured: !product.is_featured })}
            getCategoryName={getCategoryName}
            renderCategory={(name) => <CategoryChip name={name} />}
            renderStock={(product) => <StockIndicator product={product} />}
            renderStatus={(active) => <StatusIndicator active={active} />}
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

      <CsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import products"
        description="Upload product metadata in CSV format. Use category_id, category, or category_slug to match an existing category. Images can be public URLs separated by semicolons."
        templateFilename="bagstreet-products-template.csv"
        templateCsv={'name,category,description,price,stock,image_urls,is_active,is_featured,sale_price,sale_ends_at\nAvery Mini Crossbody,Handbags,Compact crossbody bag,4990,12,https://example.com/avery-front.jpg;https://example.com/avery-side.jpg,true,false,,\n'}
        onImport={async (file) => {
          const response = await importMutation.mutateAsync(file);
          return response.data!;
        }}
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
