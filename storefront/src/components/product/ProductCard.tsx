import { Link } from '@tanstack/react-router';
import type { ProductResponse } from 'shared';
import { formatPrice, isSaleActive } from '@/lib/format';

export function ProductCard({ product, priority = false }: { product: ProductResponse; priority?: boolean }) {
  const onSale = isSaleActive(product);
  const soldOut = product.stock_status === 'out';
  const hoverImage = product.images?.find((img) => !img.is_primary && img.url !== product.image_url)?.url;

  return (
    <Link to="/products/$productId" params={{ productId: product.slug || product.id }} className="group block">
      <article>
        <div className="relative aspect-[4/5] overflow-hidden bg-surface">
          {product.image_url ? (
            <>
              <img
                src={product.image_url}
                alt={product.name}
                width={640}
                height={800}
                loading={priority ? 'eager' : 'lazy'}
                decoding="async"
                fetchPriority={priority ? 'high' : 'auto'}
                sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, 50vw"
                className="ui-image h-full w-full object-cover"
              />
              {/* Second photo fades in on hover when the product has one */}
              {hoverImage && (
                <img
                  src={hoverImage}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                  className="ui-image-alt absolute inset-0 h-full w-full object-cover"
                />
              )}
            </>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-label-caps text-foreground-faint">
              Image coming soon
            </div>
          )}

          <div className="absolute left-3 top-3 flex gap-2">
            {onSale && (
              <span className="bg-espresso px-2.5 py-1 text-label-caps text-background">Sale</span>
            )}
            {soldOut && (
              <span className="rounded-full border border-stone bg-background/85 px-2.5 py-0.5 text-label-caps text-foreground-muted">
                Sold out
              </span>
            )}
          </div>
        </div>

        <div className="pt-4">
          <h3
            className="line-clamp-2 text-[19px] leading-snug text-foreground sm:text-[21px]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            <span className="decoration-[0.5px] underline-offset-4 group-hover:underline">
              {product.name}
            </span>
          </h3>
          <p className="mt-1.5 text-[13px] tracking-[0.02em] text-foreground-muted">
            {onSale ? (
              <>
                <span className="text-foreground">{formatPrice(product.sale_price!)}</span>
                <span className="ml-2 text-foreground-faint line-through">{formatPrice(product.price)}</span>
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

export function ProductCardSkeleton() {
  return (
    <article aria-hidden="true">
      <div className="aspect-[4/5] animate-pulse bg-surface" />
      <div className="pt-4">
        <div className="h-5 w-3/4 animate-pulse bg-surface" />
        <div className="mt-2 h-3 w-1/3 animate-pulse bg-surface" />
      </div>
    </article>
  );
}
