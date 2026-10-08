import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronRight, LoaderCircle, Search, X } from 'lucide-react';
import type { CategoryTreeNode, StorefrontSort } from 'shared';
import { useStorefrontCatalog } from '@/hooks/useStorefrontCatalog';
import { useSeo } from '@/hooks/useSeo';
import { categoryPath, paginationPages, type CatalogSearch } from '@/lib/catalog';
import { ProductCard, ProductCardSkeleton } from '@/components/product/ProductCard';

export function CatalogPage({
  query,
  categorySlug,
}: {
  query: CatalogSearch;
  categorySlug?: string;
}) {
  const navigate = useNavigate();
  const page = query.page ?? 1;
  const sort = query.sort ?? 'newest';
  const urlSearch = query.search ?? '';
  const [search, setSearch] = useState(urlSearch);
  const committedSearch = useRef<string | null>(null);
  const catalog = useStorefrontCatalog({
    page,
    sort,
    search: urlSearch || undefined,
    categorySlug,
    categoryId: categorySlug ? undefined : query.category,
  });
  const data = catalog.data?.data;
  const tree = data?.category_tree ?? [];
  const path = data?.category ? categoryPath(tree, data.category.id) : [];
  const rootCategory = path[0];
  const selectedCategory = path.at(-1);
  const subcategories = data?.category
    ? selectedCategory?.children.length
      ? selectedCategory.children
      : (path.at(-2)?.children ?? [])
    : [];
  const pagination = data?.pagination;
  const products = data?.products ?? [];
  const title = data?.category?.name ?? (categorySlug ? 'Collection' : 'All products');
  const filters: CatalogSearch = {
    search: urlSearch || undefined,
    sort: sort === 'newest' ? undefined : sort,
  };
  const routePath = categorySlug ? `/shop/${encodeURIComponent(categorySlug)}` : '/shop';

  useSeo({
    title: urlSearch ? `Search: ${urlSearch} | ${title}` : title,
    description:
      data?.category?.description ||
      'Explore Bagstreet handbags, shoes and accessories. Find your next favourite piece.',
    canonicalPath: `${routePath}${page > 1 ? `?page=${page}` : ''}`,
  });

  const updateQuery = (next: CatalogSearch, replace = false, resetScroll = true) => {
    if (categorySlug) {
      return navigate({
        to: '/shop/$categorySlug',
        params: { categorySlug },
        search: next,
        replace,
        resetScroll,
      });
    }
    return navigate({ to: '/shop', search: next, replace, resetScroll });
  };

  useEffect(() => {
    // A completed debounce must not overwrite text typed while navigation was pending.
    if (committedSearch.current === urlSearch) {
      committedSearch.current = null;
      return;
    }
    setSearch(urlSearch);
  }, [urlSearch, categorySlug]);

  useEffect(() => {
    if (search.trim() === urlSearch) return;
    const timer = window.setTimeout(() => {
      const nextSearch = search.trim();
      committedSearch.current = nextSearch;
      const next = { ...query, search: nextSearch || undefined, page: undefined };
      if (categorySlug) {
        void navigate({
          to: '/shop/$categorySlug',
          params: { categorySlug },
          search: next,
          replace: true,
          resetScroll: false,
        });
      } else {
        void navigate({ to: '/shop', search: next, replace: true, resetScroll: false });
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search, urlSearch, query, categorySlug, navigate]);

  useEffect(() => {
    if (!data) return;
    const normalizedSearch = {
      ...query,
      category: undefined,
      page: data.pagination.page > 1 ? data.pagination.page : undefined,
    };
    if (!categorySlug && query.category && data.category) {
      void navigate({
        to: '/shop/$categorySlug',
        params: { categorySlug: data.category.slug },
        search: normalizedSearch,
        replace: true,
      });
    } else if (data.pagination.page !== page) {
      if (categorySlug) {
        void navigate({
          to: '/shop/$categorySlug',
          params: { categorySlug },
          search: normalizedSearch,
          replace: true,
        });
      } else {
        void navigate({ to: '/shop', search: normalizedSearch, replace: true });
      }
    }
  }, [data, page, query, categorySlug, navigate]);

  if (catalog.isError) {
    const notFound = (catalog.error as { status?: number }).status === 404;
    return (
      <section className="mx-auto max-w-[1440px] px-4 pt-32 pb-24 sm:px-8 lg:px-20">
        <h1 className="font-display text-[40px] leading-tight">
          {notFound ? 'Collection not found' : 'The collection could not load'}
        </h1>
        <p className="mt-4 text-sm text-foreground-muted">
          {notFound
            ? 'This collection may have moved or is no longer available.'
            : 'Please try again in a moment.'}
        </p>
        {notFound ? (
          <Link
            to="/shop"
            className="mt-6 inline-flex items-center gap-2 text-sm underline underline-offset-4"
          >
            Browse all products <ArrowRight className="size-4" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => catalog.refetch()}
            className="mt-6 text-sm underline underline-offset-4"
          >
            Try again
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-[1440px] px-4 pt-28 pb-20 sm:px-8 lg:px-20 lg:pt-32">
      <nav aria-label="Breadcrumb" className="mb-6 text-xs text-foreground-muted">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link to="/shop" className="hover:text-foreground">
              Shop
            </Link>
          </li>
          {path.map((node) => (
            <li key={node.id} className="flex min-w-0 items-center gap-2">
              <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
              <Link
                to="/shop/$categorySlug"
                params={{ categorySlug: node.slug }}
                aria-current={node.id === data?.category?.id ? 'page' : undefined}
                className="break-words hover:text-foreground"
              >
                {node.name}
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      <h1 className="font-display break-words text-[40px] leading-tight sm:text-[48px]">{title}</h1>
      {data?.category?.description && (
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground-muted">
          {data.category.description}
        </p>
      )}

      <nav
        aria-label="Collections"
        className="mt-8 flex flex-wrap gap-x-6 gap-y-3 border-b border-border pb-4 text-sm"
      >
        <Link
          to="/shop"
          search={filters}
          aria-current={!data?.category && !categorySlug ? 'page' : undefined}
          className={
            !data?.category && !categorySlug
              ? 'text-foreground underline underline-offset-8'
              : 'text-foreground-muted hover:text-foreground'
          }
        >
          All products
        </Link>
        {tree.map((node) => (
          <CollectionLink
            key={node.id}
            node={node}
            active={rootCategory?.id === node.id}
            search={filters}
          />
        ))}
      </nav>
      {subcategories.length > 0 && (
        <nav
          aria-label="Subcollections"
          className="mt-4 flex flex-wrap gap-x-5 gap-y-3 text-[13px]"
        >
          {subcategories.map((node) => (
            <CollectionLink
              key={node.id}
              node={node}
              active={data?.category?.id === node.id}
              search={filters}
            />
          ))}
        </nav>
      )}

      <div className="mt-7 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="relative max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            maxLength={200}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search this collection"
            placeholder="Search this collection"
            className="h-11 w-full rounded border border-border bg-transparent pl-10 pr-10 text-sm placeholder:text-foreground-muted focus:border-foreground focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              title="Clear search"
              className="absolute right-0 top-0 flex size-11 items-center justify-center text-foreground-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <label className="flex items-center justify-between gap-3 text-sm text-foreground-muted">
          Sort by
          <select
            aria-label="Sort products"
            value={sort}
            onChange={(event) =>
              updateQuery({ ...query, page: undefined, sort: event.target.value as StorefrontSort })
            }
            className="h-11 min-w-0 rounded border border-border bg-background px-3 text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
          >
            <option value="newest">Newest</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
            <option value="name_asc">Name: A to Z</option>
          </select>
        </label>
      </div>

      <div
        aria-live="polite"
        aria-atomic="true"
        className="my-6 flex min-h-5 items-center gap-2 text-xs text-foreground-muted"
      >
        {pagination
          ? pagination.total > 0
            ? `Showing ${(pagination.page - 1) * pagination.limit + 1}-${Math.min(pagination.page * pagination.limit, pagination.total)} of ${pagination.total} products`
            : '0 products'
          : 'Loading products'}
        {catalog.isFetching && <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />}
      </div>

      <div aria-busy={catalog.isFetching}>
        {catalog.isLoading ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <ProductCardSkeleton key={index} />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="py-20 text-center">
            <h2 className="font-display text-[28px]">
              {urlSearch ? 'No matching products' : 'No products in this collection yet'}
            </h2>
            {urlSearch && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="mt-5 inline-flex items-center gap-2 text-sm underline underline-offset-4"
              >
                <X className="size-4" /> Clear search
              </button>
            )}
            <Link
              to="/shop"
              className="mx-auto mt-5 flex w-fit items-center gap-2 text-sm underline underline-offset-4"
            >
              Browse all products <ArrowRight className="size-4" />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product, index) => (
              <ProductCard key={product.id} product={product} priority={index < 2} />
            ))}
          </div>
        )}
      </div>

      {pagination && pagination.total_pages > 1 && (
        <nav
          aria-label="Product pagination"
          className="mt-12 flex flex-wrap items-center justify-between gap-y-4 border-t border-border pt-6"
        >
          <PageLink
            categorySlug={categorySlug}
            search={filters}
            page={pagination.page - 1}
            disabled={pagination.page === 1}
            label="Previous page"
          >
            <ArrowLeft className="size-4" /> <span className="hidden sm:inline">Previous</span>
          </PageLink>
          <div className="flex items-center gap-1">
            {paginationPages(pagination.page, pagination.total_pages).map((number) => (
              <PageLink
                key={number}
                categorySlug={categorySlug}
                search={filters}
                page={number}
                current={number === pagination.page}
                label={`Page ${number}`}
              >
                {number}
              </PageLink>
            ))}
          </div>
          <PageLink
            categorySlug={categorySlug}
            search={filters}
            page={pagination.page + 1}
            disabled={pagination.page === pagination.total_pages}
            label="Next page"
          >
            <span className="hidden sm:inline">Next</span> <ArrowRight className="size-4" />
          </PageLink>
          <p className="w-full text-center text-xs text-foreground-muted">
            Page {pagination.page} of {pagination.total_pages}
          </p>
        </nav>
      )}
    </section>
  );
}

function CollectionLink({
  node,
  active,
  search,
}: {
  node: CategoryTreeNode;
  active: boolean;
  search: CatalogSearch;
}) {
  return (
    <Link
      to="/shop/$categorySlug"
      params={{ categorySlug: node.slug }}
      search={search}
      aria-current={active ? 'page' : undefined}
      className={
        active
          ? 'max-w-full break-words text-foreground underline underline-offset-8'
          : 'max-w-full break-words text-foreground-muted hover:text-foreground'
      }
    >
      {node.name}
    </Link>
  );
}

function PageLink({
  categorySlug,
  search,
  page,
  current,
  disabled,
  label,
  children,
}: {
  categorySlug?: string;
  search: CatalogSearch;
  page: number;
  current?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const className = `inline-flex h-11 min-w-9 items-center justify-center gap-2 rounded px-2 text-sm sm:min-w-10 ${current ? 'bg-foreground text-background' : 'hover:bg-surface'}`;
  if (disabled)
    return (
      <span
        aria-disabled="true"
        aria-label={label}
        className={`${className} text-foreground-faint`}
      >
        {children}
      </span>
    );
  const props = {
    search: { ...search, page: page > 1 ? page : undefined },
    'aria-label': label,
    'aria-current': current ? ('page' as const) : undefined,
    className,
  };
  return categorySlug ? (
    <Link to="/shop/$categorySlug" params={{ categorySlug }} {...props}>
      {children}
    </Link>
  ) : (
    <Link to="/shop" {...props}>
      {children}
    </Link>
  );
}
