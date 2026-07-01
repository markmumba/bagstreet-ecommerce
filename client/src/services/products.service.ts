import { apiClient } from './api';
import type { ProductDeleteResponse, ProductResponse, ProductUpdateRequest } from 'shared';
import type { ImportReport } from '@/components/import/CsvImportDialog';

export interface ProductListParams {
  search?: string;
  page?: number;
  limit?: number;
  status?: string;
}

export const productsService = {
  getAll: async (params?: ProductListParams) => {
    const query: Record<string, unknown> = {};
    if (params?.search) query.searchTerm = params.search;
    if (params?.page) query.page = params.page;
    if (params?.limit) query.limit = params.limit;
    if (params?.status != null) query.status = params.status;
    return apiClient.get<ProductResponse[]>('/api/products', query);
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

  updateForm: async (id: string, data: FormData) => {
    return apiClient.putForm<ProductResponse>(`/api/products/${id}`, data);
  },

  delete: async (id: string) => {
    return apiClient.delete<ProductDeleteResponse>(`/api/products/${id}`);
  },

  toggleFeatured: async (id: string, is_featured: boolean) => {
    return apiClient.put<ProductResponse>(`/api/products/${id}`, { is_featured });
  },

  importCsv: async (file: File) => {
    const data = new FormData();
    data.append('file', file);
    return apiClient.postForm<ImportReport>('/api/products/import', data);
  },
};
