import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/services/api';
import type { DiscountValidationResponse } from 'shared';

export function useFreeDeliveryThreshold() {
  return useQuery({
    queryKey: ['promotions', 'free-delivery-threshold'],
    queryFn: () => apiClient.get<{ threshold: number }>('/api/settings/free-delivery-threshold'),
    staleTime: 1000 * 60,
  });
}

export function useValidateDiscountCode() {
  return useMutation({
    mutationFn: (data: { code: string; subtotal: number; phone: string }) =>
      apiClient.get<DiscountValidationResponse>('/api/discounts/validate', data),
  });
}
