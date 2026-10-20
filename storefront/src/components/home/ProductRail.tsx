import { useId, useRef } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { ProductResponse, RecommendationRail } from 'shared';
import { ProductCard, ProductCardSkeleton } from '@/components/product/ProductCard';
import { trackRecommendation } from '@/hooks/useRecommendations';
import { useRailImpression } from '@/hooks/useRailImpression';

const ITEM_WIDTH = 'w-[72vw] shrink-0 snap-start sm:w-[42vw] lg:w-[calc((min(100vw,1440px)-10rem-4.5rem)/4)]';

interface ProductRailProps {
  eyebrow: string;
  title: string;
  products: ProductResponse[];
  isLoading: boolean;
  /** Recommendation rail name: counts one impression per page view and each card click. */
  rail?: RecommendationRail;
  /** Number of skeleton cards while loading. */
  skeletonCount?: number;
}

/** Horizontally swipeable product row — the alternative to an auto-rotating carousel. */
export function ProductRail({ eyebrow, title, products, isLoading, rail, skeletonCount = 4 }: ProductRailProps) {
  const railRef = useRef<HTMLUListElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const headingId = useId();
  useRailImpression(sectionRef, rail, !isLoading && products.length > 0);

  const scroll = (dir: 1 | -1) => {
    const rail = railRef.current;
    if (rail) rail.scrollBy({
      left: dir * rail.clientWidth * 0.8,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  };

  if (!isLoading && products.length === 0) return null;
  const showArrows = products.length > 4;

  return (
    <section ref={sectionRef} aria-labelledby={headingId} aria-busy={isLoading || undefined} className="py-16 lg:py-24">
      <div className="max-w-[1440px] mx-auto flex items-end justify-between px-4 sm:px-8 lg:px-20">
        <div>
          <p className="text-label-caps text-foreground-faint">{eyebrow}</p>
          <h2 id={headingId} className="mt-3 text-headline-lg">{title}</h2>
        </div>
        {showArrows && (
          <div className="hidden gap-2 md:flex">
            <button
              type="button"
              aria-label="Previous products"
              onClick={() => scroll(-1)}
              className="flex h-11 w-11 items-center justify-center border border-border transition-colors duration-300 hover:border-foreground"
            >
              <ArrowLeft strokeWidth={1.25} className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Next products"
              onClick={() => scroll(1)}
              className="flex h-11 w-11 items-center justify-center border border-border transition-colors duration-300 hover:border-foreground"
            >
              <ArrowRight strokeWidth={1.25} className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      <ul
        ref={railRef}
        className="mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 scroll-px-4 sm:gap-6 sm:px-8 sm:scroll-px-8
                   lg:px-[max(5rem,calc((100vw-1440px)/2+5rem))] lg:scroll-px-20
                   [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {isLoading
          ? Array.from({ length: skeletonCount }, (_, i) => (
              <li key={i} className={ITEM_WIDTH}><ProductCardSkeleton /></li>
            ))
          : products.map((product, index) => (
              <li
                key={product.id}
                className={ITEM_WIDTH}
                onClick={rail ? () => trackRecommendation(rail, 'click') : undefined}
              >
                <ProductCard product={product} priority={!rail && index < 2} />
              </li>
            ))}
      </ul>
    </section>
  );
}
