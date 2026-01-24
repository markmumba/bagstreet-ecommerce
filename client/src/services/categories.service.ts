import { apiClient } from './api';
import type {  CategoryRequest, CategoryResponse } from 'shared';

export const categoriesService = {
  getAll: async (search?: string) => {
    const params = search ? { search } : undefined;
    return apiClient.get<CategoryResponse[]>('/api/categories', params);
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
};
