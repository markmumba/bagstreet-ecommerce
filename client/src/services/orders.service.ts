import { apiClient } from './api';
import type { OrderResponse, OrderStatus } from 'shared';

export interface OrderListParams {
  page?: number;
  limit?: number;
  status?: string;
}

export const ordersService = {
  getAll: (params?: OrderListParams) =>
    apiClient.get<OrderResponse[]>('/api/orders', params as Record<string, unknown>),

  getById: (id: string) => apiClient.get<OrderResponse>(`/api/orders/${id}`),

  updateStatus: (id: string, status: OrderStatus) =>
    apiClient.patch<OrderResponse>(`/api/orders/${id}/status`, { status }),
};
