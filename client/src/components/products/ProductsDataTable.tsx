import type { ProductListSort, ProductResponse } from 'shared';
import { ArrowDown, ArrowUp, Boxes, Copy, Eye, EyeOff, ImageIcon, Link2, MoreHorizontal, Package, Pencil, Search, Star, StarOff, Tag, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type Product = ProductResponse;

/** Everything a row can do. The page owns the dialogs and sheets these open. */
export interface ProductRowActions {
  edit: (product: Product) => void;
  openStock: (product: Product) => void;
  openPairings: (product: Product) => void;
  openSale: (product: Product) => void;
  toggleFeatured: (product: Product) => void;
  toggleVisible: (product: Product) => void;
  copySku: (product: Product) => void;
  remove: (product: Product) => void;
}

interface ProductsDataTableProps {
  products: Product[];
  isLoading: boolean;
  categoryName: (categoryId: string) => string;
  sort: ProductListSort;
  onSortChange: (sort: ProductListSort) => void;
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  actions: ProductRowActions;
  /** A search, view or category is narrowing the list (changes the empty state). */
  isFiltered: boolean;
  onClearFilters: () => void;
  onCreateNew: () => void;
}

const LOADING_ROWS = 6;

export function ProductsDataTable({
  products,
  isLoading,
  categoryName,
  sort,
  onSortChange,
  selectedIds,
  onSelectionChange,
  actions,
  isFiltered,
  onClearFilters,
  onCreateNew,
}: ProductsDataTableProps) {
  const allSelected = products.length > 0 && products.every((p) => selectedIds.has(p.id));
  const someSelected = !allSelected && products.some((p) => selectedIds.has(p.id));

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };
  const toggleAll = () => onSelectionChange(allSelected ? new Set() : new Set(products.map((p) => p.id)));

  const empty = (
    <div className="flex flex-col items-center gap-3 py-10 text-center text-muted-foreground">
      {isFiltered ? <Search className="h-6 w-6" strokeWidth={1.5} /> : <Package className="h-6 w-6" strokeWidth={1.5} />}
      <div>
        <p className="font-medium text-foreground">{isFiltered ? 'No products match' : 'Your catalogue is empty'}</p>
        <p className="mt-1 text-sm">{isFiltered ? 'Try another search, or show all products.' : 'Add your first product to go live.'}</p>
      </div>
      {isFiltered
        ? <Button variant="outline" onClick={onClearFilters}>Show all products</Button>
        : <Button onClick={onCreateNew}>Add product</Button>}
    </div>
  );

  return (
    <>
      {/* Phone and tablet: one card per product */}
      <div className="space-y-2 lg:hidden">
        {isLoading
          ? Array.from({ length: LOADING_ROWS }, (_, i) => <div key={i} className="skeleton h-[88px] rounded-xl" />)
          : products.length === 0
          ? <div className="rounded-xl border bg-card">{empty}</div>
          : products.map((product) => (
            <div key={product.id} className={cn('flex items-start gap-3 rounded-xl border bg-card p-3', selectedIds.has(product.id) && 'border-primary/40 bg-primary/5')}>
              <div className="pt-1"><SelectBox checked={selectedIds.has(product.id)} onChange={() => toggleOne(product.id)} label={`Select ${product.name}`} /></div>
              <div className="min-w-0 flex-1">
                <ProductIdentity product={product} onOpen={actions.edit} size="lg" />
                <div className="mt-2 flex items-center justify-between gap-3 border-t pt-2 text-sm">
                  <button type="button" onClick={() => actions.openSale(product)} className="cell-action -ml-1.5" aria-label={`Price of ${product.name}: set a sale price`}>
                    <PriceValue product={product} inline />
                  </button>
                  <StockValue product={product} onOpen={actions.openStock} inline />
                </div>
              </div>
              <RowMenu product={product} actions={actions} />
            </div>
          ))}
      </div>

      {/* Desktop */}
      <div className="hidden overflow-hidden rounded-xl border bg-card lg:block">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-10" />
            <col />
            <col className="w-28 xl:w-40" />
            <col className="w-28 xl:w-36" />
            <col className="w-32 xl:w-36" />
            <col className="w-12" />
          </colgroup>
          <thead className="border-b bg-muted/30 text-left text-xs font-medium text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5">
                <SelectBox checked={allSelected} indeterminate={someSelected} onChange={toggleAll} label="Select all products on this page" disabled={isLoading || products.length === 0} />
              </th>
              <SortableHeader label="Product" asc="name_asc" desc="name_desc" sort={sort} onSortChange={onSortChange} />
              <th className="px-3 py-2.5 font-medium">Category</th>
              <SortableHeader label="Price" asc="price_asc" desc="price_desc" sort={sort} onSortChange={onSortChange} align="right" />
              <SortableHeader label="Stock" asc="stock_asc" desc="stock_desc" sort={sort} onSortChange={onSortChange} align="right" />
              <th className="px-3 py-2.5"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: LOADING_ROWS }, (_, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-3 py-3" colSpan={6}><div className="skeleton h-10 w-full rounded-md" /></td>
                </tr>
              ))
              : products.length === 0
              ? <tr><td colSpan={6}>{empty}</td></tr>
              : products.map((product) => {
                const selected = selectedIds.has(product.id);
                return (
                  <tr key={product.id} className={cn('border-b transition-colors last:border-0 hover:bg-muted/40', selected && 'bg-primary/5 hover:bg-primary/10')}>
                    <td className="px-3 py-2.5">
                      <SelectBox checked={selected} onChange={() => toggleOne(product.id)} label={`Select ${product.name}`} />
                    </td>
                    <td className="px-3 py-2.5"><ProductIdentity product={product} onOpen={actions.edit} /></td>
                    <td className={cn('truncate px-3 py-2.5', product.is_active ? 'text-muted-foreground' : 'text-muted-foreground/70')}>
                      {categoryName(product.category_id)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button type="button" onClick={() => actions.openSale(product)} className="cell-action -mr-1.5 ml-auto" aria-label={`Price of ${product.name}: set a sale price`}>
                        <PriceValue product={product} />
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <StockValue product={product} onOpen={actions.openStock} />
                    </td>
                    <td className="px-2 py-2.5 text-right"><RowMenu product={product} actions={actions} /></td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SortableHeader({ label, asc, desc, sort, onSortChange, align = 'left' }: {
  label: string;
  asc: ProductListSort;
  desc: ProductListSort;
  sort: ProductListSort;
  onSortChange: (sort: ProductListSort) => void;
  align?: 'left' | 'right';
}) {
  const direction = sort === asc ? 'ascending' : sort === desc ? 'descending' : 'none';
  const Icon = direction === 'descending' ? ArrowDown : ArrowUp;
  return (
    <th className={cn('px-3 py-2.5 font-medium', align === 'right' && 'text-right')} aria-sort={direction}>
      <button
        type="button"
        onClick={() => onSortChange(sort === asc ? desc : asc)}
        className={cn('-mx-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring', direction !== 'none' && 'text-foreground')}
      >
        {label}
        <Icon className={cn('h-3.5 w-3.5', direction === 'none' && 'opacity-0')} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </th>
  );
}

function SelectBox({ checked, indeterminate, onChange, label, disabled }: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      ref={(el) => { if (el) el.indeterminate = Boolean(indeterminate); }}
      onChange={onChange}
      className="select-box"
    />
  );
}

/** Photo, name (opens the editor), SKU, and labels only for what's out of the ordinary. */
function ProductIdentity({ product, onOpen, size = 'md' }: { product: Product; onOpen: (p: Product) => void; size?: 'md' | 'lg' }) {
  const onSale = product.sale_price != null;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className={cn('shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border', size === 'lg' ? 'h-14 w-14' : 'h-10 w-10')}>
        {product.image_url ? (
          <img
            src={product.image_url}
            alt=""
            width={size === 'lg' ? 56 : 40}
            height={size === 'lg' ? 56 : 40}
            loading="lazy"
            className={cn('h-full w-full object-cover', !product.is_active && 'opacity-50 grayscale')}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageIcon className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <button
          type="button"
          onClick={() => onOpen(product)}
          title={product.name}
          className={cn('block max-w-full truncate text-left font-medium hover:underline focus-visible:underline focus-visible:outline-none', product.is_active ? 'text-foreground' : 'text-muted-foreground')}
        >
          {product.name}
        </button>
        <div className="mt-1 flex min-w-0 items-center gap-1.5">
          {product.is_featured && <Label tone="featured"><Star className="h-3 w-3 fill-current" aria-hidden="true" />Featured</Label>}
          {onSale && <Label tone="sale">Sale</Label>}
          {!product.is_active && <Label tone="hidden">Hidden</Label>}
          <span className="truncate font-mono text-[11px] text-muted-foreground">{product.sku}</span>
        </div>
      </div>
    </div>
  );
}

function Label({ tone, children }: { tone: 'featured' | 'sale' | 'hidden'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium leading-none',
        tone === 'featured' && 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]',
        tone === 'sale' && 'bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]',
        tone === 'hidden' && 'bg-muted text-muted-foreground',
      )}
    >
      {children}
    </span>
  );
}

/** `inline`: one line, sale price then the struck-through regular price (phone cards). */
function PriceValue({ product, inline }: { product: Product; inline?: boolean }) {
  if (product.sale_price == null) return <span className="font-medium tabular-nums">{formatMoney(product.price)}</span>;
  return (
    <span className={cn('flex tabular-nums', inline ? 'items-baseline gap-1.5' : 'flex-col items-end')}>
      <span className="font-medium">{formatMoney(product.sale_price)}</span>
      <span className="text-[11px] text-muted-foreground line-through">{formatMoney(product.price)}</span>
    </span>
  );
}

/** The total in plain text; a note only when some size needs restocking. Opens stock and sizes. */
function StockValue({ product, onOpen, inline }: { product: Product; onOpen: (p: Product) => void; inline?: boolean }) {
  const total = product.total_stock ?? product.stock;
  const soldOut = product.out_of_stock_variant_count ?? 0;
  const low = product.low_stock_variant_count ?? 0;
  const note = total === 0
    ? { text: 'Sold out', tone: 'danger' }
    : soldOut > 0
    ? { text: `${soldOut} size${soldOut === 1 ? '' : 's'} sold out`, tone: 'danger' }
    : low > 0
    ? { text: `${low} size${low === 1 ? '' : 's'} low`, tone: 'warning' }
    : null;

  return (
    <button
      type="button"
      onClick={() => onOpen(product)}
      className={cn('cell-action -mr-1.5 ml-auto', inline ? 'items-baseline gap-1.5' : 'flex-col items-end')}
      aria-label={`${total} in stock${note ? `, ${note.text}` : ''}: open stock and sizes for ${product.name}`}
    >
      <span className="font-medium tabular-nums">{total}{inline && <span className="font-normal text-muted-foreground"> in stock</span>}</span>
      {note && (
        <span className={cn('text-[11px] font-medium', note.tone === 'danger' ? 'text-[var(--color-danger-text)]' : 'text-[var(--color-warning-text)]')}>
          {note.text}
        </span>
      )}
    </button>
  );
}

function RowMenu({ product, actions }: { product: Product; actions: ProductRowActions }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 px-0" aria-label={`Actions for ${product.name}`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => actions.edit(product)}><Pencil />Edit details</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.openStock(product)}><Boxes />Stock and sizes</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.openSale(product)}><Tag />{product.sale_price != null ? 'Change sale price' : 'Set sale price'}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.openPairings(product)}><Link2 />Goes well with</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => actions.toggleFeatured(product)}>
          {product.is_featured ? <><StarOff />Remove from featured</> : <><Star />Feature on homepage</>}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.toggleVisible(product)}>
          {product.is_active ? <><EyeOff />Hide from shop</> : <><Eye />Show in shop</>}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.copySku(product)}><Copy />Copy SKU</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => actions.remove(product)}><Trash2 />Remove…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
