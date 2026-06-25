import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import type { OrderResponse } from 'shared';

export function useOrders() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['orders'],
    queryFn: () => apiClient.get<OrderResponse[]>('/api/orders'),
    enabled: !!user,
    staleTime: 1000 * 60,
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
      notes?: string;
    }) => apiClient.post<OrderResponse>('/api/orders', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['cart'] });
    },
  });
}
