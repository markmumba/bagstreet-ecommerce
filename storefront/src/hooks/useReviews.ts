import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrderReviewsResponse, ProductReviewsResponse, ReviewStatus, ReviewUpsertRequest } from 'shared';
import { apiClient } from '@/services/api';

const REVIEWS_PAGE_SIZE = 5;

/** Approved reviews for a product, newest first. `fetchNextPage` appends the next page ("Show more"). */
export function useProductReviews(productId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['product-reviews', productId],
    queryFn: ({ pageParam }) =>
      apiClient.get<ProductReviewsResponse>(`/api/reviews/products/${productId}`, {
        page: pageParam,
        limit: REVIEWS_PAGE_SIZE,
      }),
    initialPageParam: 1,
    getNextPageParam: (last) => {
      const data = last.data;
      if (!data) return undefined;
      return data.page * data.limit < data.total ? data.page + 1 : undefined;
    },
    enabled: !!productId,
    staleTime: 1000 * 60 * 5,
  });
}

/** The products in an order with the customer's own reviews. Token is optional when signed in. */
export function useOrderReviews(orderRef: string | undefined, token?: string) {
  return useQuery({
    queryKey: ['order-reviews', orderRef],
    queryFn: () => apiClient.get<OrderReviewsResponse>('/api/reviews/order', { order_ref: orderRef, token: token || undefined }),
    enabled: !!orderRef,
    retry: false,
    staleTime: 1000 * 30,
  });
}

export function useUpsertReview(orderRef: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, ...data }: ReviewUpsertRequest & { productId: string }) =>
      apiClient.put<{ id: string; status: ReviewStatus }>(`/api/reviews/order/${productId}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['order-reviews', orderRef] }),
  });
}

export function useDeleteReview(orderRef: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, ...data }: { productId: string; order_ref: string; token?: string }) =>
      apiClient.delete<null>(`/api/reviews/order/${productId}`, data),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['order-reviews', orderRef] });
      qc.invalidateQueries({ queryKey: ['product-reviews', vars.productId] });
    },
  });
}
