import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/services/api';
import type { ProductResponse } from 'shared';

export function useProduct(id: string) {
  return useQuery({
    queryKey: ['products', id],
    queryFn: () => apiClient.get<ProductResponse>(`/api/products/${id}`),
    enabled: !!id,
    staleTime: 1000 * 60 * 2,
  });
}

export function useProductVariants(productId: string | undefined) {
  return useQuery({
    queryKey: ['products', productId, 'variants'],
    queryFn: () => apiClient.get(`/api/products/${productId}/variants`),
    enabled: !!productId,
    staleTime: 1000 * 60 * 2,
  });
}
