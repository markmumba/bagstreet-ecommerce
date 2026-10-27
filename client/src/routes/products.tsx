import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { PRODUCT_LIST_SORTS, PRODUCT_LIST_VIEWS, type CategoryResponse, type ProductListSort, type ProductListView, type ProductResponse } from 'shared';
import { useProducts, useProductViewCounts, useDeleteProduct, useToggleFeatured, useUpdateProduct, useImportProductsCsv } from '@/hooks/useProducts';
import { useSetProductSale } from '@/hooks/usePromotions';
import { useCategoryOptions } from '@/hooks/useCategories';
import { ProductDialog } from '@/components/products/ProductDialog';
import { ProductsDataTable, type ProductRowActions } from '@/components/products/ProductsDataTable';
import { VariantsSheet } from '@/components/products/VariantsSheet';
import { PairingsSheet } from '@/components/products/PairingsSheet';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { CsvImportDialog } from '@/components/import/CsvImportDialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Plus, Star, StarOff, Tag, Upload, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import { toast } from '@/lib/toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorNotice, errorMessage } from '@/components/ui/notice';
import { useListParams } from '@/hooks/useListParams';

export const Route = createFileRoute('/products')({
  component: ProductsPage,
});

type Product = ProductResponse;

const LIMIT = 20;

const VIEWS: { value: '' | ProductListView; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'restock', label: 'Needs restock' },
  { value: 'sale', label: 'On sale' },
  { value: 'featured', label: 'Featured' },
  { value: 'hidden', label: 'Hidden' },
];

const asView = (value: unknown): ProductListView | undefined =>
  (PRODUCT_LIST_VIEWS as readonly unknown[]).includes(value) ? value as ProductListView : undefined;
const asSort = (value: unknown): ProductListSort =>
  (PRODUCT_LIST_SORTS as readonly unknown[]).includes(value) ? value as ProductListSort : 'name_asc';

function ProductsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [variantsProduct, setVariantsProduct] = useState<Product | null>(null);
  const [variantsSheetOpen, setVariantsSheetOpen] = useState(false);
  const [pairingsProduct, setPairingsProduct] = useState<Product | null>(null);
  const [pairingsSheetOpen, setPairingsSheetOpen] = useState(false);
  const [removeProduct, setRemoveProduct] = useState<Product | null>(null);
  const [saleProduct, setSaleProduct] = useState<Product | null>(null);
  const [saleForm, setSaleForm] = useState({ sale_price: '', sale_ends_at: '' });
  const [saleError, setSaleError] = useState('');
  const [removeResult, setRemoveResult] = useState<{
    action: 'deleted' | 'deactivated' | 'error';
    message: string;
  } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSaleOpen, setBulkSaleOpen] = useState(false);
  const [bulkSaleForm, setBulkSaleForm] = useState({ percent: '', ends_at: '' });
  const [bulkSaleError, setBulkSaleError] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  // Search, view, category, sort and page live in the URL.
  const list = useListParams({ view: '', category: '', sort: 'name_asc' });
  const { page, setPage, searchText: search, setSearchText: setSearch, query: debouncedSearch } = list;
  const view = asView(list.params.view);
  const sort = asSort(list.params.sort);
  const categoryId = String(list.params.category ?? '') || undefined;

  const { data: res, isLoading, error } = useProducts({
    search: debouncedSearch || undefined,
    categoryId,
    view,
    sort,
    page,
    limit: LIMIT,
  });
  const { data: counts } = useProductViewCounts({ search: debouncedSearch || undefined, categoryId });

  const products: Product[] = res?.items ?? [];
  const total = res?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const isFiltered = Boolean(debouncedSearch || view || categoryId);

  // A selection only means something for the rows on screen.
  useEffect(() => setSelectedIds(new Set()), [page, view, categoryId, debouncedSearch, sort]);
  const selected = products.filter((p) => selectedIds.has(p.id));

  const { data: categories } = useCategoryOptions();
  const deleteMutation = useDeleteProduct();
  const toggleFeaturedMutation = useToggleFeatured();
  const updateMutation = useUpdateProduct();
  const importMutation = useImportProductsCsv();
  const setProductSaleMutation = useSetProductSale();

  const getCategoryName = (id: string) =>
    categories?.find((c: CategoryResponse) => c.id === String(id))?.name || '—';

  const handleCreate = () => {
    setEditingProduct(null);
    setDialogOpen(true);
  };

  const actions: ProductRowActions = {
    edit: (product) => {
      setEditingProduct(product);
      setDialogOpen(true);
    },
    openStock: (product) => {
      setVariantsProduct(product);
      setVariantsSheetOpen(true);
    },
    openPairings: (product) => {
      setPairingsProduct(product);
      setPairingsSheetOpen(true);
    },
    openSale: (product) => {
      setSaleProduct(product);
      setSaleForm({
        sale_price: product.sale_price != null ? String(product.sale_price) : '',
        sale_ends_at: product.sale_ends_at ? product.sale_ends_at.slice(0, 10) : '',
      });
      setSaleError('');
    },
    toggleFeatured: (product) =>
      toggleFeaturedMutation.mutate({ id: product.id, is_featured: !product.is_featured }, {
        onSuccess: () => toast.success(product.is_featured ? `${product.name} removed from featured` : `${product.name} featured on the homepage`),
        onError: (err) => toast.error(errorMessage(err, 'Couldn’t change featured. Try again.')),
      }),
    toggleVisible: (product) =>
      updateMutation.mutate({ id: product.id, data: { is_active: !product.is_active } }, {
        onSuccess: () => toast.success(product.is_active ? `${product.name} hidden from the shop` : `${product.name} is back in the shop`),
        onError: (err) => toast.error(errorMessage(err, 'Couldn’t change visibility. Try again.')),
      }),
    copySku: (product) => {
      navigator.clipboard?.writeText(product.sku)
        .then(() => toast.success(`Copied ${product.sku}`))
        .catch(() => toast.error('Copying isn’t allowed here. Select the SKU instead.'));
    },
    remove: (product) => {
      setRemoveProduct(product);
      setRemoveResult(null);
    },
  };

  /** Runs one change per selected product; reports how many worked. */
  const runBulk = async (label: string, change: (product: Product) => Promise<unknown>, targets: Product[] = selected) => {
    if (targets.length === 0) return;
    setBulkBusy(true);
    const results = await Promise.allSettled(targets.map(change));
    setBulkBusy(false);
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed === 0) {
      toast.success(`${label}: ${targets.length} product${targets.length === 1 ? '' : 's'}`);
      setSelectedIds(new Set());
    } else {
      toast.error(`${label}: ${failed} of ${targets.length} didn’t save. Try those again.`);
    }
  };

  const allFeatured = selected.length > 0 && selected.every((p) => p.is_featured);
  const allHidden = selected.length > 0 && selected.every((p) => !p.is_active);

  const submitSale = async () => {
    if (!saleProduct) return;
    if (!saleForm.sale_price.trim()) {
      setSaleError('Enter a sale price lower than the regular price.');
      return;
    }
    const salePrice = Number(saleForm.sale_price);
    if (!Number.isFinite(salePrice) || salePrice < 0) {
      setSaleError('Sale price must be zero or more.');
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
    } catch (error) {
      setSaleError(errorMessage(error, 'Could not save the sale. Check your connection and try again.'));
    }
  };

  const removeSale = async () => {
    if (!saleProduct) return;
    try {
      await setProductSaleMutation.mutateAsync({ id: saleProduct.id, data: { sale_price: null } });
      setSaleProduct(null);
    } catch (error) {
      setSaleError(errorMessage(error, 'Could not remove the sale. Check your connection and try again.'));
    }
  };

  /** Percent off each selected product's regular price, rounded to whole shillings. */
  const submitBulkSale = async () => {
    const percent = Number(bulkSaleForm.percent);
    if (!bulkSaleForm.percent.trim() || !Number.isFinite(percent) || percent <= 0 || percent >= 100) {
      setBulkSaleError('Enter a discount between 1 and 99 percent.');
      return;
    }
    const endsAt = bulkSaleForm.ends_at ? new Date(bulkSaleForm.ends_at).toISOString() : null;
    setBulkSaleOpen(false);
    await runBulk(`${percent}% off`, (product) => setProductSaleMutation.mutateAsync({
      id: product.id,
      data: { sale_price: Math.max(0, Math.round(product.price * (1 - percent / 100))), sale_ends_at: endsAt },
    }));
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
      if (result.action === 'deactivated') {
        setRemoveResult({
          action: 'deactivated',
          message: `"${removeProduct.name}" has order history, so it was hidden from the shop instead of permanently deleted.`,
        });
      } else {
        setRemoveResult({
          action: 'deleted',
          message: `"${removeProduct.name}" was permanently deleted.`,
        });
      }
    } catch (error: unknown) {
      setRemoveResult({
        action: 'error',
        message: errorMessage(error, 'Could not remove the product. Check your connection and try again.'),
      });
    }
  };

  const formatPrice = (price: number) => formatMoney(price);

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold leading-tight">Products</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              What's in the shop, what it costs, and what needs restocking
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" />
              Import CSV
            </Button>
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4" />
              New product
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="search"
              aria-label="Search products by name or SKU"
              autoComplete="off"
              spellCheck={false}
              placeholder="Search name or SKU…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full sm:w-64"
            />
            <Select value={categoryId ?? 'all'} onValueChange={(v) => list.update({ category: v === 'all' ? '' : v })}>
              <SelectTrigger className="h-9 w-full sm:w-44" aria-label="Category">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories?.map((c: CategoryResponse) => (
                  <SelectItem key={c.id} value={c.id}>{c.parent_name ? `${c.parent_name} › ${c.name}` : c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Selecting swaps the views for bulk actions in the same spot, so rows never move under the pointer. */}
          {selected.length > 0 ? (
            <div role="region" aria-label="Bulk actions" className="flex h-9 items-center gap-1 no-scrollbar overflow-x-auto whitespace-nowrap rounded-full border border-primary/30 bg-primary/5 pl-4 pr-1">
              <span className="mr-auto pr-2 text-sm font-medium tabular-nums">{selected.length} selected</span>
              <Button variant="ghost" size="sm" className="h-7 shrink-0 rounded-full" disabled={bulkBusy}
                onClick={() => runBulk(allFeatured ? 'Removed from featured' : 'Featured', (p) => toggleFeaturedMutation.mutateAsync({ id: p.id, is_featured: !allFeatured }))}>
                {allFeatured ? <StarOff className="h-4 w-4" /> : <Star className="h-4 w-4" />}
                {allFeatured ? 'Remove from featured' : 'Feature'}
              </Button>
              <Button variant="ghost" size="sm" className="h-7 shrink-0 rounded-full" disabled={bulkBusy}
                onClick={() => { setBulkSaleForm({ percent: '', ends_at: '' }); setBulkSaleError(''); setBulkSaleOpen(true); }}>
                <Tag className="h-4 w-4" />
                Put on sale
              </Button>
              <Button variant="ghost" size="sm" className="h-7 shrink-0 rounded-full" disabled={bulkBusy}
                onClick={() => runBulk(allHidden ? 'Back in the shop' : 'Hidden from the shop', (p) => updateMutation.mutateAsync({ id: p.id, data: { is_active: allHidden } }))}>
                {allHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                {allHidden ? 'Show in shop' : 'Hide from shop'}
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 shrink-0 rounded-full px-0" aria-label="Clear selection" onClick={() => setSelectedIds(new Set())}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div role="group" aria-label="Show" className="-mx-1 flex h-9 items-center gap-1.5 no-scrollbar overflow-x-auto px-1">
              {VIEWS.map((v) => {
                const active = (view ?? '') === v.value;
                const count = counts ? counts[v.value || 'all'] : undefined;
                const urgent = v.value === 'restock' && (count ?? 0) > 0;
                return (
                  <button
                    key={v.value || 'all'}
                    type="button"
                    aria-pressed={active}
                    onClick={() => list.update({ view: v.value })}
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                      active ? 'border-foreground/20 bg-foreground text-background' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {v.label}
                    {count != null && (
                      <span className={cn('tabular-nums', !active && urgent && 'font-semibold text-[var(--color-danger-text)]', !active && !urgent && 'text-muted-foreground/80')}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error ? (
          <ErrorNotice>{errorMessage(error, 'Couldn’t load products. Check your connection and refresh.')}</ErrorNotice>
        ) : (
          <ProductsDataTable
            products={products}
            isLoading={isLoading}
            categoryName={getCategoryName}
            sort={sort}
            onSortChange={(next) => list.update({ sort: next })}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            actions={actions}
            isFiltered={isFiltered}
            onClearFilters={() => { setSearch(''); list.update({ view: '', category: '', q: '' }); }}
            onCreateNew={handleCreate}
          />
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm tabular-nums text-muted-foreground">Page {page} of {totalPages} · {total} products</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(page - 1)} disabled={page <= 1}>Previous</Button>
              <Button variant="outline" size="sm" onClick={() => setPage(page + 1)} disabled={page >= totalPages}>Next</Button>
            </div>
          </div>
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
          return importMutation.mutateAsync(file);
        }}
      />

      <VariantsSheet
        open={variantsSheetOpen}
        onOpenChange={setVariantsSheetOpen}
        product={variantsProduct}
      />

      <PairingsSheet
        open={pairingsSheetOpen}
        onOpenChange={setPairingsSheetOpen}
        product={pairingsProduct}
      />

      <Dialog open={bulkSaleOpen} onOpenChange={setBulkSaleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Put {selected.length} product{selected.length === 1 ? '' : 's'} on sale</DialogTitle>
            <DialogDescription>Each sale price is this much off that product's regular price, rounded to whole shillings.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="bulk-sale-percent">Discount (%)</Label>
              <Input
                id="bulk-sale-percent"
                type="number"
                inputMode="numeric"
                min="1"
                max="99"
                value={bulkSaleForm.percent}
                onChange={(e) => { setBulkSaleForm((f) => ({ ...f, percent: e.target.value })); setBulkSaleError(''); }}
                placeholder="20"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bulk-sale-ends">Ends on (optional)</Label>
              <Input id="bulk-sale-ends" type="date" value={bulkSaleForm.ends_at} onChange={(e) => setBulkSaleForm((f) => ({ ...f, ends_at: e.target.value }))} />
            </div>
            <ErrorNotice>{bulkSaleError}</ErrorNotice>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkSaleOpen(false)}>Cancel</Button>
            <Button onClick={submitBulkSale} disabled={bulkBusy}>Put on sale</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!saleProduct} onOpenChange={(open) => { if (!open) setSaleProduct(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Flash sale</DialogTitle>
            <DialogDescription>
              {saleProduct ? `Set a sale price for "${saleProduct.name}". Variant price overrides still take priority.` : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="sale-price">Sale price</Label>
              <Input
                id="sale-price"
                type="number"
                inputMode="decimal"
                min="0"
                value={saleForm.sale_price}
                onChange={(e) => setSaleForm((f) => ({ ...f, sale_price: e.target.value }))}
                placeholder={saleProduct ? `e.g. ${Math.max(0, Math.round(saleProduct.price * 0.8))}` : ''}
                aria-describedby="sale-price-hint"
              />
              {saleProduct && (
                <p id="sale-price-hint" className="text-xs text-muted-foreground">
                  Regular price {formatPrice(saleProduct.price)}. The sale price must be lower.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sale-ends-at">Ends on (optional)</Label>
              <Input
                id="sale-ends-at"
                type="date"
                value={saleForm.sale_ends_at}
                onChange={(e) => setSaleForm((f) => ({ ...f, sale_ends_at: e.target.value }))}
              />
            </div>
            <ErrorNotice>{saleError}</ErrorNotice>
          </div>

          <DialogFooter>
            {saleProduct?.sale_price != null && (
              <Button variant="outline" onClick={removeSale} disabled={setProductSaleMutation.isPending}>
                Remove sale
              </Button>
            )}
            <Button onClick={submitSale} disabled={setProductSaleMutation.isPending}>
              {setProductSaleMutation.isPending ? 'Saving…' : 'Save sale'}
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
                  {deleteMutation.isPending ? 'Removing…' : 'Remove product'}
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
