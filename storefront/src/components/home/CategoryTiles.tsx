import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import type { CategoryTreeNode, ProductResponse } from 'shared';
import { Placeholder } from '@/components/product/Placeholder';
import { categoryImage } from '@/lib/format';

export function CategoryTiles({ tree, products }: { tree: CategoryTreeNode[]; products: ProductResponse[] }) {
  // A single category tile duplicates the nav — wait until there are at least two.
  if (tree.length < 2) return null;

  return (
    <section aria-labelledby="shop-by-category-title" className="max-w-[1440px] mx-auto px-4 py-10 sm:px-8 lg:px-20 lg:py-12">
      <h2 id="shop-by-category-title" className="font-display text-[28px] leading-tight sm:text-[32px]">Shop by category</h2>
      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:gap-x-6 lg:grid-cols-4">
        {tree.map((node) => {
          const image = categoryImage(node, products);
          return (
            <Link
              key={node.id}
              to="/shop/$categorySlug"
              params={{ categorySlug: node.slug }}
              className="group block min-w-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              <div className="aspect-[4/3] overflow-hidden rounded bg-surface">
                {image ? (
                  <img
                    src={image}
                    alt=""
                    width={320}
                    height={240}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:transform-none"
                  />
                ) : (
                  <Placeholder seed={`tile-${node.id}`} label={node.name} className="h-full w-full" />
                )}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 text-foreground transition-colors group-hover:text-brass-text">
                <h3 className="min-w-0 break-words font-display text-[20px] leading-snug">{node.name}</h3>
                <ArrowRight strokeWidth={1.25} className="h-4 w-4 shrink-0" aria-hidden="true" />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
