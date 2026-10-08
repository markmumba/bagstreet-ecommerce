import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/services/api';
import type { StorefrontCatalogResponse, StorefrontSort } from 'shared';

interface CatalogParams {
  page: number;
  search?: string;
  categorySlug?: string;
  categoryId?: number;
  sort: StorefrontSort;
}

export function useStorefrontCatalog(params: CatalogParams) {
  return useQuery({
    queryKey: ['storefront', 'catalog', params],
    queryFn: () =>
      apiClient.get<StorefrontCatalogResponse>('/api/storefront/catalog', {
        ...params,
        limit: 24,
      }),
    staleTime: 1000 * 60 * 2,
    retry: (count, error) => (error as { status?: number }).status !== 404 && count < 1,
  });
}
