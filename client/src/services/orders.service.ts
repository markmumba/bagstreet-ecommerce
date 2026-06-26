import { apiClient } from './api';
import type { OrderResponse, OrderStatus, PaymentStatus } from 'shared';

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

  updateStatus: (id: string, status: OrderStatus) =>
    apiClient.patch<OrderResponse>(`/api/orders/${id}/status`, { status }),

  confirmPayment: (id: string) =>
    apiClient.patch<OrderResponse>(`/api/orders/${id}/confirm-payment`),
};
