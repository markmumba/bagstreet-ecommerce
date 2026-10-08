import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/services/api';
import type { StorefrontHero } from 'shared';

export function useStorefrontHero() {
  return useQuery({
    queryKey: ['storefront', 'hero'],
    queryFn: () => apiClient.get<StorefrontHero>('/api/settings/storefront-hero'),
    staleTime: 1000 * 60 * 5,
  });
}
