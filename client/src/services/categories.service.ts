import { apiClient } from './api';
import type { CategoryRequest, CategoryResponse, CategoryTreeNode } from 'shared';

export interface CategoryListParams {
  search?: string;
  page?: number;
  limit?: number;
}

export const categoriesService = {
  getAll: async (params?: CategoryListParams) => {
    return apiClient.get<CategoryResponse[]>('/api/categories', params as Record<string, unknown>);
  },

  getById: async (id: string) => {
    return apiClient.get<CategoryResponse>(`/api/categories/${id}`);
  },

  create: async (data: CategoryRequest) => {
    return apiClient.post<CategoryResponse>('/api/categories', data);
  },

  update: async (id: string, data: Partial<CategoryRequest>) => {
    return apiClient.put<CategoryResponse>(`/api/categories/${id}`, data);
  },

  delete: async (id: string) => {
    return apiClient.delete<void>(`/api/categories/${id}`);
  },

  getTree: async () => {
    return apiClient.get<CategoryTreeNode[]>('/api/categories/tree');
  },
};
