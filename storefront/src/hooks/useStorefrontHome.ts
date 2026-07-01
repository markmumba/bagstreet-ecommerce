import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/services/api';
import type { StorefrontHomeResponse } from 'shared';

interface StorefrontHomeParams {
  search?: string;
  categoryId?: string;
  limit?: number;
}

export function useStorefrontHome(params: StorefrontHomeParams) {
  return useQuery({
    queryKey: ['storefront', 'home', params],
    queryFn: () =>
      apiClient.get<StorefrontHomeResponse>('/api/storefront/home', {
        search: params.search || undefined,
        categoryId: params.categoryId || undefined,
        limit: params.limit ?? 48,
      }),
    staleTime: 1000 * 60 * 2,
  });
}
