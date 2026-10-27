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
      voucher_code?: string;
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

/** Starts payment: M-Pesa sends the PIN prompt (to `pay_phone` if given); Pesapal returns its page. */
export function useInitiatePayment() {
  return useMutation({
    mutationFn: (data: OrderPaymentAccess & { pay_phone?: string }) =>
      apiClient.post<PaymentRetryResponse>('/api/payments/initiate', data),
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

/** After an M-Pesa prompt is sent, keep checking this long — the prompt itself times out in about a minute. */
const PROMPT_WATCH_MS = 3 * 60 * 1000;

/** True while an M-Pesa prompt was sent recently enough that the customer may still be paying it. */
export function isAwaitingPrompt(info: PaymentStatusResponse | undefined): boolean {
  if (!info || info.status !== 'PENDING' || info.payment_provider !== 'mpesa' || !info.prompt_sent_at) return false;
  return Date.now() - new Date(info.prompt_sent_at).getTime() < PROMPT_WATCH_MS;
}

/**
 * Live payment status for an order, asked of the server (which checks with M-Pesa or Pesapal) —
 * the checkout page renders from this, never from the `payment=` value in a return URL.
 * Polls while an M-Pesa prompt is waiting on the customer's phone.
 */
export function usePaymentStatus(orderRef: string | undefined, token: string | undefined, { watch = false } = {}) {
  return useQuery({
    queryKey: ['payment-status', orderRef],
    queryFn: () => apiClient.post<PaymentStatusResponse>('/api/payments/status', { order_ref: orderRef, token }),
    enabled: Boolean(orderRef && token),
    retry: false,
    staleTime: 0,
    refetchInterval: (query) => (watch && isAwaitingPrompt(query.state.data?.data) ? 4000 : false),
  });
}
