import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/services/api';
import type { DiscountValidationResponse } from 'shared';

export function useValidateDiscountCode() {
  return useMutation({
    mutationFn: (data: { code: string; subtotal: number; phone: string }) =>
      apiClient.get<DiscountValidationResponse>('/api/discounts/validate', data),
  });
}
