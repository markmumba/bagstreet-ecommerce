import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ordersService, type OrderListParams } from '@/services/orders.service';
import type { OrderStatus } from 'shared';

export const orderKeys = {
  all: ['orders'] as const,
  lists: () => [...orderKeys.all, 'list'] as const,
  list: (params?: OrderListParams) => [...orderKeys.lists(), params] as const,
  detail: (id: string) => [...orderKeys.all, 'detail', id] as const,
  receipt: (id: string) => [...orderKeys.all, 'receipt', id] as const,
};

export function useOrders(params?: OrderListParams) {
  return useQuery({
    queryKey: orderKeys.list(params),
    queryFn: async () => {
      const res = await ordersService.getAll(params);
      return res;
    },
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

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) =>
      ordersService.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
    },
  });
}

export function useConfirmOrderPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => ordersService.confirmPayment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
    },
  });
}
