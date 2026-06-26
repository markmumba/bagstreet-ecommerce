import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { z } from 'zod';
import { Search } from 'lucide-react';
import { useProducts } from '@/hooks/useProducts';
import { useCategoryTree } from '@/hooks/useCategories';
import type { ProductResponse, CategoryTreeNode } from 'shared';

export const Route = createFileRoute('/')({
  validateSearch: z.object({ search: z.string().optional() }),
  component: HomePage,
});

function formatPrice(price: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(price);
}

function ProductCard({ product }: { product: ProductResponse }) {
  const saleIsActive = product.sale_price != null
    && (!product.sale_ends_at || new Date(product.sale_ends_at).getTime() > Date.now());

  return (
    <Link to="/products/$productId" params={{ productId: product.id }}>
      <article className="group cursor-pointer">
        {/* Portrait image — 3:4 ratio */}
        <div className="relative aspect-[3/4] overflow-hidden bg-[var(--surface)]">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[var(--foreground-faint)] text-xs tracking-[0.18em] uppercase">
              No Image
            </div>
          )}

          {saleIsActive && (
            <span className="absolute left-3 top-3 bg-foreground px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-background">
              Sale
            </span>
          )}

          {/* Slide-up quick view */}
          <div
            className="absolute bottom-0 left-0 right-0 translate-y-full group-hover:translate-y-0
                       transition-transform duration-300 ease-out
                       bg-foreground/90 px-4 py-3 flex items-center justify-center"
          >
            <span
              className="text-xs tracking-[0.18em] uppercase text-background"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Quick View
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="pt-4 pb-2">
          <p
            className="text-sm font-light tracking-wide text-foreground leading-snug"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            {product.name}
          </p>
          <p
            className="text-sm font-light text-[var(--foreground-muted)] mt-1.5"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {saleIsActive ? (
              <>
                <span className="text-foreground">{formatPrice(product.sale_price!)}</span>
                <span className="ml-2 text-[var(--foreground-faint)] line-through">{formatPrice(product.price)}</span>
              </>
            ) : (
              formatPrice(product.price)
            )}
          </p>
        </div>
      </article>
    </Link>
  );
}

function HomePage() {
  const { search: urlSearch } = Route.useSearch();
  const navigate = useNavigate();
  const [search, setSearch] = useState(urlSearch ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(urlSearch ?? '');
  const [selectedParentId, setSelectedParentId] = useState('');
  const [categoryId, setCategoryId] = useState('');

  // Sync URL search param → local state on first load
  useEffect(() => {
    if (urlSearch !== undefined) {
      setSearch(urlSearch);
      setDebouncedSearch(urlSearch);
    }
  }, [urlSearch]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      // Keep URL in sync so search is shareable
      navigate({ to: '/', search: search ? { search } : {}, replace: true });
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const { data: featuredRes } = useProducts({ limit: 8, status: 'true' });
  const featuredProducts = ((featuredRes?.data as ProductResponse[]) ?? []).filter(p => p.is_featured);

  const { data: productsRes, isLoading } = useProducts({
    search: debouncedSearch || undefined,
    categoryId: categoryId || undefined,
    limit: 48,
  });

  const { data: categoryTreeRes } = useCategoryTree();

  const products = (productsRes?.data as ProductResponse[]) ?? [];
  const tree = (categoryTreeRes?.data as CategoryTreeNode[]) ?? [];

  const selectedParent = tree.find((p) => p.id === selectedParentId) ?? null;

  const handleParentClick = (parent: CategoryTreeNode) => {
    if (selectedParentId === parent.id) {
      setSelectedParentId('');
      setCategoryId('');
    } else {
      setSelectedParentId(parent.id);
      setCategoryId(parent.id);
    }
  };

  const handleSubClick = (childId: string) => {
    setCategoryId(categoryId === childId ? selectedParentId : childId);
  };

  const handleAllClick = () => {
    setSelectedParentId('');
    setCategoryId('');
  };

  return (
    <div className="max-w-360 mx-auto px-8 sm:px-12 lg:px-20">
      {/* Hero */}
      <div className="pt-40 pb-24 text-center">
        <p
          className="text-xs tracking-[0.3em] uppercase text-(--foreground-faint) mb-6"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          New Arrivals
        </p>
        <h1
          className="text-5xl sm:text-6xl lg:text-7xl font-light italic text-foreground mb-6 leading-tight"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Crafted for<br />the discerning eye
        </h1>
        <p
          className="text-sm font-light text-(--foreground-muted) max-w-sm mx-auto leading-relaxed tracking-wide"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          Luxury handbags, shoes &amp; cashmere scarves — curated for the modern woman.
        </p>
      </div>

      {/* Featured */}
      {featuredProducts.length > 0 && (
        <section className="mb-24">
          <div className="flex items-baseline justify-between mb-10 border-b border-(--border-subtle) pb-4">
            <h2
              className="text-2xl font-light text-foreground"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Featured
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-12">
            {featuredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      {/* Filters */}
      <div className="mb-16">
        {/* Search */}
        <div className="relative max-w-xs mb-8">
          <Search strokeWidth={1} className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--foreground-faint)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full pl-6 pr-0 py-2
                       bg-transparent border-0 border-b border-[var(--border)]
                       text-sm font-light text-foreground
                       placeholder:text-[var(--foreground-faint)]
                       focus:outline-none focus:border-foreground
                       transition-colors duration-200"
            style={{ fontFamily: 'var(--font-sans)' }}
          />
        </div>

        {/* Row 1: top-level category tabs */}
        <nav className="flex gap-8 border-b border-[var(--border)]">
          <button
            onClick={handleAllClick}
            className={`pb-3 text-xs tracking-[0.15em] uppercase whitespace-nowrap transition-colors duration-200 -mb-px
              ${categoryId === ''
                ? 'text-foreground border-b-2 border-foreground'
                : 'text-[var(--foreground-faint)] hover:text-[var(--foreground-muted)]'
              }`}
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            All
          </button>
          {tree.map((parent) => (
            <button
              key={parent.id}
              onClick={() => handleParentClick(parent)}
              className={`pb-3 text-xs tracking-[0.15em] uppercase whitespace-nowrap transition-colors duration-200 -mb-px
                ${selectedParentId === parent.id
                  ? 'text-foreground border-b-2 border-foreground'
                  : 'text-[var(--foreground-faint)] hover:text-[var(--foreground-muted)]'
                }`}
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              {parent.name}
            </button>
          ))}
        </nav>

        {/* Row 2: subcategory pills */}
        {selectedParent && selectedParent.children.length > 0 && (
          <div className="flex gap-6 pt-4 pl-0">
            {selectedParent.children.map((child) => (
              <button
                key={child.id}
                onClick={() => handleSubClick(child.id)}
                className={`text-xs tracking-[0.12em] uppercase transition-colors duration-200
                  ${categoryId === child.id
                    ? 'text-foreground underline underline-offset-4'
                    : 'text-[var(--foreground-faint)] hover:text-[var(--foreground-muted)]'
                  }`}
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                {child.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Product grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-12 pb-24">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] bg-[var(--surface)] animate-pulse" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div
          className="text-center py-32 text-[var(--foreground-faint)] text-xs tracking-[0.2em] uppercase"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          No products found
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-12 pb-24">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
