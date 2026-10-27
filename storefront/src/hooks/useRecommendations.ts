import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import type {
  ProductRecommendationsResponse,
  RecommendationEventRequest,
  RecommendationRail,
  RecommendedProductsResponse,
} from 'shared';
import { apiClient } from '@/services/api';
import { readRecentlyViewed } from '@/lib/recently-viewed';

const API_BASE = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';
const STALE_TIME = 1000 * 60 * 5;

/** Normalised, de-duplicated id list; `sort` gives a stable cache key when order doesn't matter. */
function idList(ids: (string | number)[], sort: boolean): string[] {
  const unique = [...new Set(ids.map(String).filter((id) => /^\d+$/.test(id)))];
  return sort ? unique.sort((a, b) => Number(a) - Number(b)) : unique;
}

/** "Complete the look" and "You may also like" for one product (numeric product id). */
export function useProductRecommendations(productId: string | number | undefined) {
  const id = productId == null ? '' : String(productId);
  return useQuery({
    queryKey: ['recommendations', 'product', id],
    queryFn: async () => (await apiClient.get<ProductRecommendationsResponse>(`/api/recommendations/products/${id}`)).data!,
    enabled: /^\d+$/.test(id),
    staleTime: STALE_TIME,
    retry: 1,
  });
}

/** Pieces to suggest alongside the bag. An empty bag still gets popular pieces. */
export function useBagRecommendations(productIds: (string | number)[], enabled = true) {
  const ids = idList(productIds, true);
  const key = ids.join(',');
  return useQuery({
    queryKey: ['recommendations', 'bag', key],
    queryFn: async () =>
      (await apiClient.get<RecommendedProductsResponse>('/api/recommendations/bag', { product_ids: key || undefined })).data!
        .products,
    enabled,
    // Changing a quantity or removing an item shouldn't make the rail flash.
    placeholderData: keepPreviousData,
    staleTime: STALE_TIME,
    retry: 1,
  });
}

/** The given products (still on sale), in the given order. */
export function useRecentlyViewedProducts(productIds: (string | number)[]) {
  const ids = idList(productIds, false).slice(0, 12);
  const key = ids.join(',');
  return useQuery({
    queryKey: ['recommendations', 'viewed', key],
    queryFn: async () =>
      (await apiClient.get<RecommendedProductsResponse>('/api/recommendations/viewed', { product_ids: key })).data!.products,
    enabled: ids.length > 0,
    staleTime: STALE_TIME,
    retry: 1,
  });
}

/** Recently viewed product ids from this browser, re-read on each page view. */
export function useRecentlyViewedIds(): string[] {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [state, setState] = useState(() => ({ pathname, ids: readRecentlyViewed() }));
  if (state.pathname !== pathname) {
    const next = { pathname, ids: readRecentlyViewed() };
    setState(next);
    return next.ids;
  }
  return state.ids;
}

/**
 * Counts a rail impression or click. Fire-and-forget: never throws, never delays navigation.
 * Sent as text/plain so the browser skips the CORS preflight (the server parses the body as JSON).
 */
export function trackRecommendation(rail: RecommendationRail, event: RecommendationEventRequest['event']): void {
  try {
    const body: RecommendationEventRequest = { rail, event };
    void fetch(`${API_BASE}/api/recommendations/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body),
      keepalive: true,
      credentials: 'omit',
    }).catch(() => undefined);
  } catch {
    // Counting is best effort.
  }
}
