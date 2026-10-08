import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import type { OrderReceiptResponse, OrderResponse, PaymentRetryResponse, PaymentStatusResponse } from 'shared';

export function useOrders() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['orders'],
    queryFn: () => apiClient.get<OrderResponse[]>('/api/orders'),
    enabled: !!user,
    staleTime: 1000 * 60,
  });
}

export function useOrder(orderId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['orders', orderId],
    queryFn: () => apiClient.get<OrderResponse>(`/api/orders/${orderId}`),
    enabled: !!user && !!orderId,
    staleTime: 1000 * 60,
  });
}

export function useOrderReceipt(orderId: string | undefined, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['orders', orderId, 'receipt'],
    queryFn: () => apiClient.get<OrderReceiptResponse>(`/api/orders/${orderId}/receipt`),
    enabled: !!user && !!orderId && enabled,
    staleTime: 1000 * 60 * 5,
  });
}

export function usePlaceOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      items: { variant_id: number; quantity: number }[];
      shipping_address: Record<string, string>;
      shipping_location_id: number;
      phone: string;
      email?: string;
      discount_code?: string;
      notes?: string;
      policy_acceptance: { accepted: true; version: string };
    }) => apiClient.post<OrderResponse>('/api/orders', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['cart'] });
    },
  });
}

/** Identifies an order for payment actions: by id or public ref, proven by the checkout token or phone/email. */
type OrderPaymentAccess = { order_id?: number; order_ref?: string; token?: string; phone?: string; email?: string };

export function useInitiatePesapalPayment() {
  return useMutation({
    mutationFn: (data: OrderPaymentAccess) =>
      apiClient.post<PaymentRetryResponse>('/api/payments/pesapal/initiate', data),
  });
}

export function useCheckPesapalPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: OrderPaymentAccess & { order_tracking_id?: string }) =>
      apiClient.post<PaymentStatusResponse>('/api/payments/pesapal/status', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['cart'] });
    },
  });
}

export function useCompleteDevPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: OrderPaymentAccess) =>
      apiClient.post<PaymentStatusResponse>('/api/payments/dev-complete', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['cart'] });
    },
  });
}

/**
 * Live payment status for an order, asked of the server (which checks Pesapal) — the checkout
 * page renders from this, never from the `payment=` value in the return URL.
 */
export function usePaymentStatus(orderRef: string | undefined, token: string | undefined) {
  return useQuery({
    queryKey: ['payment-status', orderRef],
    queryFn: () => apiClient.post<PaymentStatusResponse>('/api/payments/pesapal/status', { order_ref: orderRef, token }),
    enabled: Boolean(orderRef && token),
    retry: false,
    staleTime: 0,
  });
}
