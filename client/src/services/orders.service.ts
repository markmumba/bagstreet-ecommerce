import { apiClient } from './api';
import type {
  OrderReceiptResponse,
  OrderResponse,
  OrderStatus,
  PaymentStatus,
  WalkInCatalogItemResponse,
  WalkInSaleRequest,
} from 'shared';

export interface OrderListParams {
  page?: number;
  limit?: number;
  status?: string;
  payment_status?: PaymentStatus;
}

export const ordersService = {
  getAll: (params?: OrderListParams) =>
    apiClient.get<OrderResponse[]>('/api/orders', params as Record<string, unknown>),

  getById: (id: string) => apiClient.get<OrderResponse>(`/api/orders/${id}`),

  getReceipt: (id: string) => apiClient.get<OrderReceiptResponse>(`/api/orders/${id}/receipt`),

  updateStatus: (id: string, status: OrderStatus) =>
    apiClient.patch<OrderResponse>(`/api/orders/${id}/status`, { status }),

  confirmPayment: (id: string) =>
    apiClient.patch<OrderResponse>(`/api/orders/${id}/confirm-payment`),

  getWalkInCatalog: (search?: string) =>
    apiClient.get<WalkInCatalogItemResponse[]>('/api/orders/walk-in/catalog', {
      search: search || undefined,
      limit: 80,
    }),

  createWalkInSale: (data: WalkInSaleRequest) =>
    apiClient.post<OrderResponse>('/api/orders/walk-in', data),
};
