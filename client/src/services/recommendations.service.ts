import { apiClient } from './api';
import type {
  CategoryPairingsRequest,
  CategoryPairingsResponse,
  ProductPairingsResponse,
  RecommendationStatsResponse,
} from 'shared';

export const recommendationsService = {
  getProductPairings: (productId: string) =>
    apiClient.get<ProductPairingsResponse>(`/api/recommendations/admin/products/${productId}/pairings`),
  setProductPairings: (productId: string, productIds: string[]) =>
    apiClient.put<ProductPairingsResponse>(`/api/recommendations/admin/products/${productId}/pairings`, {
      product_ids: productIds,
    }),
  getCategoryPairings: () =>
    apiClient.get<CategoryPairingsResponse>('/api/recommendations/admin/categories/pairings'),
  setCategoryPairings: (data: CategoryPairingsRequest) =>
    apiClient.put<CategoryPairingsResponse>('/api/recommendations/admin/categories/pairings', data),
  stats: (days: number) =>
    apiClient.get<RecommendationStatsResponse>('/api/recommendations/admin/stats', { days }),
};
