import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { z } from 'zod';
import { useStorefrontHome } from '@/hooks/useStorefrontHome';
import { useSeo } from '@/hooks/useSeo';
import { ProductCard, ProductCardSkeleton } from '@/components/product/ProductCard';
import { Hero } from '@/components/home/Hero';
import { ProductRail } from '@/components/home/ProductRail';
import { CategoryTiles } from '@/components/home/CategoryTiles';
import { CraftStory } from '@/components/home/CraftStory';

export const Route = createFileRoute('/')({
  validateSearch: z.object({
    search: z.string().optional(),
    category: z.coerce.number().int().positive().optional().catch(undefined),
  }),
  beforeLoad: ({ search }) => {
    if (search.search || search.category) {
      throw redirect({
        to: '/shop',
        search: { search: search.search, category: search.category },
        replace: true,
      });
    }
  },
  component: HomePage,
});

function HomePage() {
  const homeQuery = useStorefrontHome({ limit: 48 });
  const featuredProducts = homeQuery.data?.data?.featured_products ?? [];
  const products = homeQuery.data?.data?.products ?? [];
  const tree = homeQuery.data?.data?.category_tree ?? [];
  const railProducts = featuredProducts.length > 0 ? featuredProducts : products.slice(0, 8);

  useSeo({
    title: 'Bagstreet - Luxury Handbags & Accessories',
    description: 'Shop curated luxury handbags, shoes, and silk from Bagstreet.',
    canonicalPath: '/',
  });

  return (
    <>
      <Hero />
      <ProductRail
        eyebrow={featuredProducts.length > 0 ? 'The Edit' : 'Just In'}
        title={featuredProducts.length > 0 ? 'Featured pieces' : 'New arrivals'}
        products={railProducts}
        isLoading={homeQuery.isLoading}
      />
      <CategoryTiles tree={tree} products={[...featuredProducts, ...products]} />
      <CraftStory />

      <section
        id="collection"
        className="mx-auto max-w-[1440px] scroll-mt-[72px] px-4 pt-20 pb-24 sm:px-8 lg:px-20 lg:pt-28"
      >
        <div className="mb-10 flex flex-wrap items-end justify-between gap-6 border-b border-border pb-8">
          <div>
            <p className="text-label-caps text-foreground-faint">Shop</p>
            <h2 className="mt-4 text-headline-lg">The collection</h2>
          </div>
          <Link
            to="/shop"
            className="inline-flex items-center gap-3 text-sm underline underline-offset-4 hover:text-brass-text"
          >
            Shop all products <ArrowRight className="size-4" />
          </Link>
        </div>
        {homeQuery.isError ? (
          <div className="py-10 text-center text-sm">
            <p>The collection could not load.</p>
            <button
              type="button"
              onClick={() => homeQuery.refetch()}
              className="mt-4 underline underline-offset-4"
            >
              Try again
            </button>
          </div>
        ) : !homeQuery.isLoading && products.length === 0 ? (
          <p className="py-10 text-center text-sm text-foreground-muted">
            New pieces are on their way.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-12 sm:gap-x-6 lg:grid-cols-3 xl:grid-cols-4">
            {homeQuery.isLoading
              ? Array.from({ length: 8 }, (_, index) => <ProductCardSkeleton key={index} />)
              : products
                  .slice(0, 8)
                  .map((product) => <ProductCard key={product.id} product={product} />)}
          </div>
        )}
      </section>
    </>
  );
}
