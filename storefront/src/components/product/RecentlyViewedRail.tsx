import { ProductRail } from '@/components/home/ProductRail';
import { useRecentlyViewedIds, useRecentlyViewedProducts } from '@/hooks/useRecommendations';

interface RecentlyViewedRailProps {
  /** Product to leave out, e.g. the one on the current page (numeric id). */
  excludeId?: string;
  /** Rendered instead when this browser has no other recently viewed pieces. */
  fallback?: React.ReactNode;
  /** Wraps the rail when it shows (e.g. a bordered band). */
  className?: string;
}

/** "Recently viewed" from this browser's history; renders nothing (or the fallback) when there is none. */
export function RecentlyViewedRail({ excludeId, fallback = null, className = 'border-t border-border-subtle' }: RecentlyViewedRailProps) {
  const ids = useRecentlyViewedIds().filter((id) => id !== excludeId);
  const query = useRecentlyViewedProducts(ids);
  const products = (query.data ?? []).filter((product) => product.id !== excludeId);

  if (ids.length === 0 || query.isError || (!query.isLoading && products.length === 0)) return <>{fallback}</>;

  return (
    <div className={className}>
      <ProductRail
        eyebrow="Your selection"
        title="Recently viewed"
        products={products}
        isLoading={query.isLoading}
        skeletonCount={Math.min(4, ids.length)}
        rail="recently_viewed"
      />
    </div>
  );
}
