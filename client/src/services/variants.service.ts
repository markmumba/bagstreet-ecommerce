import { apiClient } from './api';
import type { ProductVariantResponse, ProductVariantRequest } from 'shared';

export const variantsService = {
  getAll: async (productId: string) => {
    return apiClient.get<ProductVariantResponse[]>(`/api/products/${productId}/variants`);
  },

  create: async (productId: string, data: ProductVariantRequest) => {
    return apiClient.post<ProductVariantResponse>(`/api/products/${productId}/variants`, data);
  },

  update: async (productId: string, variantId: string, data: Partial<ProductVariantRequest>) => {
    return apiClient.put<ProductVariantResponse>(`/api/products/${productId}/variants/${variantId}`, data);
  },

  delete: async (productId: string, variantId: string) => {
    return apiClient.delete<void>(`/api/products/${productId}/variants/${variantId}`);
  },

  adjustStock: async (
    productId: string,
    variantId: string,
    data: { delta: number; reason: 'ADMIN_ADJUSTMENT' | 'RESTOCK'; note?: string }
  ) => {
    return apiClient.post<ProductVariantResponse>(
      `/api/products/${productId}/variants/${variantId}/stock`,
      data
    );
  },

  getStockHistory: async (productId: string, variantId: string) => {
    return apiClient.get<{
      id: number;
      delta: number;
      reason: string;
      reference_id: number | null;
      note: string | null;
      created_by_name: string | null;
      created_at: string;
    }[]>(`/api/products/${productId}/variants/${variantId}/stock/history`);
  },
};
