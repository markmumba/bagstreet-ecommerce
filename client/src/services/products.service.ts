import { apiClient } from './api';
import type { ProductResponse, ProductUpdateRequest } from 'shared';

export const productsService = {
  getAll: async (search?: string) => {
    const params = search ? { search } : undefined;
    return apiClient.get<ProductResponse[]>('/api/products', params);
  },

  getById: async (id: string) => {
    return apiClient.get<ProductResponse>(`/api/products/${id}`);
  },

  create: async (data: FormData) => {
    return apiClient.postForm<ProductResponse>('/api/products', data);
  },

  update: async (id: string, data: ProductUpdateRequest) => {
    return apiClient.put<ProductResponse>(`/api/products/${id}`, data);
  },

  delete: async (id: string) => {
    return apiClient.delete<void>(`/api/products/${id}`);
  },

  toggleFeatured: async (id: string, is_featured: boolean) => {
    return apiClient.put<ProductResponse>(`/api/products/${id}`, { is_featured });
  },
};
