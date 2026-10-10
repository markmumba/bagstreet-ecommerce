import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ordersService, type OrderListParams } from '@/services/orders.service';
import { productKeys } from '@/hooks/useProducts';
import type { OrderStatus, RecordRefundRequest, WalkInSaleRequest } from 'shared';

export const orderKeys = {
  all: ['orders'] as const,
  lists: () => [...orderKeys.all, 'list'] as const,
  list: (params?: OrderListParams) => [...orderKeys.lists(), params] as const,
  detail: (id: string) => [...orderKeys.all, 'detail', id] as const,
  receipt: (id: string) => [...orderKeys.all, 'receipt', id] as const,
  payments: (id: string) => [...orderKeys.all, 'payments', id] as const,
  walkInCatalog: (search?: string) => [...orderKeys.all, 'walk-in-catalog', search ?? ''] as const,
};

export function useOrders(params?: OrderListParams) {
  return useQuery({
    queryKey: orderKeys.list(params),
    queryFn: () => ordersService.getAll(params),
  });
}

export function useOrderReceipt(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: id ? orderKeys.receipt(id) : [...orderKeys.all, 'receipt', 'missing'],
    queryFn: async () => {
      if (!id) throw new Error('Order id is required');
      return ordersService.getReceipt(id);
    },
    enabled: Boolean(id) && enabled,
  });
}

export function useWalkInCatalog(search: string, enabled = true) {
  return useQuery({
    queryKey: orderKeys.walkInCatalog(search),
    queryFn: () => ordersService.getWalkInCatalog(search),
    enabled,
    staleTime: 1000 * 30,
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: OrderStatus; reason?: string }) =>
      ordersService.updateStatus(id, status, reason),
    onSuccess: (_res, { id }) => {
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      queryClient.invalidateQueries({ queryKey: orderKeys.payments(id) });
      queryClient.invalidateQueries({ queryKey: productKeys.lists() });
    },
  });
}

export function useWriteOffReversal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => ordersService.writeOff(id, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
    },
  });
}

export function useConfirmOrderPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => ordersService.confirmPayment(id),
    onSuccess: (_res, { id }) => {
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      queryClient.invalidateQueries({ queryKey: orderKeys.payments(id) });
    },
  });
}

export function useCreateWalkInSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: WalkInSaleRequest) => ordersService.createWalkInSale(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      queryClient.invalidateQueries({ queryKey: productKeys.lists() });
    },
  });
}

/** What an order has been paid and refunded, with its ledger history (staff only). */
export function useOrderPayments(id: string | undefined) {
  return useQuery({
    queryKey: id ? orderKeys.payments(id) : [...orderKeys.all, 'payments', 'missing'],
    queryFn: () => ordersService.getPayments(id!),
    enabled: Boolean(id),
  });
}

export function useRecordRefund() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: RecordRefundRequest }) => ordersService.recordRefund(id, data),
    onSuccess: (_res, { id }) => {
      queryClient.invalidateQueries({ queryKey: orderKeys.payments(id) });
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
    },
  });
}
