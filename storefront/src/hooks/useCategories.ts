import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/services/api';
import type { CategoryTreeNode } from 'shared';

export function useCategoryTree() {
  return useQuery({
    queryKey: ['categories', 'tree'],
    queryFn: () => apiClient.get<CategoryTreeNode[]>('/api/categories/tree'),
    staleTime: 1000 * 60 * 10,
  });
}
