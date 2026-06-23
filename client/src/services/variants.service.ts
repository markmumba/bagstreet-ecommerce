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
};
