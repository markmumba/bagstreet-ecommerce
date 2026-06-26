import { apiClient } from './api';
import type { DiscountCodeResponse, ProductResponse } from 'shared';

export interface DiscountCodeInput {
  code: string;
  value: number;
  min_order_amount: number;
  usage_limit?: number | null;
  expires_at?: string | null;
  is_active?: boolean;
}

export const promotionsService = {
  getDiscounts: () => apiClient.get<DiscountCodeResponse[]>('/api/discounts'),
  createDiscount: (data: DiscountCodeInput) => apiClient.post<DiscountCodeResponse>('/api/discounts', data),
  updateDiscount: (id: string, data: Partial<DiscountCodeInput>) =>
    apiClient.put<DiscountCodeResponse>(`/api/discounts/${id}`, data),
  deactivateDiscount: (id: string) => apiClient.delete<DiscountCodeResponse>(`/api/discounts/${id}`),
  getFreeDeliveryThreshold: () => apiClient.get<{ threshold: number }>('/api/settings/free-delivery-threshold'),
  updateFreeDeliveryThreshold: (threshold: number) =>
    apiClient.put<{ threshold: number }>('/api/settings/free-delivery-threshold', { threshold }),
  getOnSaleProducts: () => apiClient.get<ProductResponse[]>('/api/products/on-sale'),
  setProductSale: (id: string, data: { sale_price: number | null; sale_ends_at?: string | null }) =>
    apiClient.patch<ProductResponse>(`/api/products/${id}/sale`, data),
};
