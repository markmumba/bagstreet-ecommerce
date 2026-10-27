import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CategoryPairingsRequest } from 'shared';
import { recommendationsService } from '@/services/recommendations.service';

export const recommendationKeys = {
  all: ['recommendations'] as const,
  productPairings: (productId: string) => ['recommendations', 'product-pairings', productId] as const,
  categoryPairings: ['recommendations', 'category-pairings'] as const,
  stats: (days: number) => ['recommendations', 'stats', days] as const,
};

/** "Goes well with" picks for one product, in display order. */
export function useProductPairings(productId: string | null) {
  return useQuery({
    queryKey: recommendationKeys.productPairings(productId ?? ''),
    queryFn: () => recommendationsService.getProductPairings(productId!),
    enabled: Boolean(productId),
  });
}

export function useSetProductPairings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, productIds }: { productId: string; productIds: string[] }) =>
      recommendationsService.setProductPairings(productId, productIds),
    onSuccess: (data, { productId }) => {
      queryClient.setQueryData(recommendationKeys.productPairings(productId), data);
    },
  });
}

/** Top-level categories that go together (ones with no pairings are absent). */
export function useCategoryPairings() {
  return useQuery({
    queryKey: recommendationKeys.categoryPairings,
    queryFn: () => recommendationsService.getCategoryPairings(),
    staleTime: 1000 * 60 * 5,
  });
}

export function useSetCategoryPairings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CategoryPairingsRequest) => recommendationsService.setCategoryPairings(data),
    onSuccess: (data) => {
      queryClient.setQueryData(recommendationKeys.categoryPairings, data);
    },
  });
}

/** How often each recommendation rail was shown and clicked. */
export function useRecommendationStats(days = 30) {
  return useQuery({
    queryKey: recommendationKeys.stats(days),
    queryFn: () => recommendationsService.stats(days),
    staleTime: 1000 * 60 * 5,
  });
}
