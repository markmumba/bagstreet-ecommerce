import { useMutation } from '@tanstack/react-query';
import type { GiftVoucherBalanceResponse, GiftVoucherPurchaseRequest } from 'shared';
import { apiClient } from '@/services/api';

export interface GiftVoucherPurchaseResponse {
  order_id: string;
  public_id: string;
  order_number: string;
  total_amount: number;
  amount_due: number;
  payment_redirect_url: string | null;
  payment_reference: string | null;
  access_token: string;
}

export function useBuyGiftVoucher() {
  return useMutation({
    mutationFn: (data: GiftVoucherPurchaseRequest) =>
      apiClient.post<GiftVoucherPurchaseResponse>('/api/gift-vouchers/purchase', data),
  });
}

export function useCheckVoucherBalance() {
  return useMutation({
    mutationFn: (code: string) => apiClient.post<GiftVoucherBalanceResponse>('/api/gift-vouchers/balance', { code }),
  });
}
