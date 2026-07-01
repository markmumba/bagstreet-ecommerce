import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { categoriesService, type CategoryListParams } from '@/services/categories.service';
import type { CategoryRequest, CategoryResponse, CategoryTreeNode } from 'shared';

export const categoryKeys = {
  all: ['categories'] as const,
  lists: () => [...categoryKeys.all, 'list'] as const,
  list: (params?: CategoryListParams) => [...categoryKeys.lists(), params] as const,
  details: () => [...categoryKeys.all, 'detail'] as const,
  detail: (id: string) => [...categoryKeys.details(), id] as const,
  tree: () => [...categoryKeys.all, 'tree'] as const,
};

/** Full paginated response — use on the categories admin page */
export function useCategories(params?: CategoryListParams) {
  return useQuery({
    queryKey: categoryKeys.list(params),
    queryFn: () => categoriesService.getAll(params),
    staleTime: 1000 * 60 * 5,
  });
}

/** Simple array — use in dropdowns/selects (fetches up to 200) */
export function useCategoryOptions() {
  return useQuery({
    queryKey: categoryKeys.list({ limit: 200 }),
    queryFn: async () => {
      const res = await categoriesService.getAll({ limit: 200 });
      return (res.data as CategoryResponse[]) || [];
    },
    staleTime: 1000 * 60 * 5,
  });
}

/** Category tree — use for hierarchical selects/filters */
export function useCategoryTree() {
  return useQuery({
    queryKey: categoryKeys.tree(),
    queryFn: async () => {
      const res = await categoriesService.getTree();
      return (res.data as CategoryTreeNode[]) || [];
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useCategory(id: string) {
  return useQuery({
    queryKey: categoryKeys.detail(id),
    queryFn: async () => {
      const response = await categoriesService.getById(id);
      return response.data;
    },
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CategoryRequest) => categoriesService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.lists() });
    },
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CategoryRequest> }) =>
      categoriesService.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: categoryKeys.lists() });
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => categoriesService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.lists() });
    },
  });
}

export function useImportCategoriesCsv() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => categoriesService.importCsv(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.all });
    },
  });
}
