import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/services/api';
import { useAuth } from '@/context/AuthContext';

export const cartKeys = { all: ['cart'] as const };

export function useCart() {
  const { user } = useAuth();
  return useQuery({
    queryKey: cartKeys.all,
    queryFn: () => apiClient.get('/api/cart'),
    enabled: !!user,
    staleTime: 1000 * 30,
  });
}

export function useAddToCart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { variant_id: number; quantity: number }) =>
      apiClient.post('/api/cart', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: cartKeys.all }),
  });
}

export function useUpdateCartItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ variantId, quantity }: { variantId: number; quantity: number }) =>
      apiClient.patch(`/api/cart/${variantId}`, { quantity }),
    onSuccess: () => qc.invalidateQueries({ queryKey: cartKeys.all }),
  });
}

export function useRemoveCartItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (variantId: number) => apiClient.delete(`/api/cart/${variantId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: cartKeys.all }),
  });
}

export function useClearCart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete('/api/cart'),
    onSuccess: () => qc.invalidateQueries({ queryKey: cartKeys.all }),
  });
}
