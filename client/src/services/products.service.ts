import { apiClient } from './api';
import type { ProductDeleteResponse, ProductResponse, ProductUpdateRequest, ProductListSort, ProductListView, ProductViewCounts } from 'shared';
import type { ImportReport } from '@/components/import/CsvImportDialog';

export interface ProductListParams {
  /** Matches the name or SKU. */
  search?: string;
  page?: number;
  limit?: number;
  categoryId?: string;
  view?: ProductListView;
  sort?: ProductListSort;
}

export const productsService = {
  getAll: async (params?: ProductListParams) => {
    const query: Record<string, unknown> = {};
    if (params?.search) query.searchTerm = params.search;
    if (params?.page) query.page = params.page;
    if (params?.limit) query.limit = params.limit;
    if (params?.categoryId) query.categoryId = params.categoryId;
    if (params?.view) query.view = params.view;
    if (params?.sort) query.sort = params.sort;
    return apiClient.getPage<ProductResponse>('/api/products', query);
  },

  getViewCounts: async (params?: Pick<ProductListParams, 'search' | 'categoryId'>) => {
    const query: Record<string, unknown> = {};
    if (params?.search) query.searchTerm = params.search;
    if (params?.categoryId) query.categoryId = params.categoryId;
    return apiClient.get<ProductViewCounts>('/api/products/view-counts', query);
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
