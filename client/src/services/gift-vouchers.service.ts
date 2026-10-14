import { apiClient } from './api';
import type {
  GiftVoucherDetailResponse,
  GiftVoucherIssueRequest,
  GiftVoucherResponse,
  GiftVoucherStatus,
  GiftVoucherSummaryResponse,
  IssuedGiftVoucherResponse,
} from 'shared';

export interface GiftVoucherFilters {
  page: number;
  limit: number;
  status?: GiftVoucherStatus;
  search?: string;
}

export const giftVouchersService = {
  list: (filters: GiftVoucherFilters) =>
    apiClient.getPage<GiftVoucherResponse>('/api/gift-vouchers', filters as unknown as Record<string, unknown>),
  get: (id: string) => apiClient.get<GiftVoucherDetailResponse>(`/api/gift-vouchers/${id}`),
  summary: () => apiClient.get<GiftVoucherSummaryResponse>('/api/gift-vouchers/summary'),
  issue: (data: GiftVoucherIssueRequest) => apiClient.post<IssuedGiftVoucherResponse>('/api/gift-vouchers', data),
  lookup: (code: string) => apiClient.post<GiftVoucherResponse>('/api/gift-vouchers/lookup', { code }),
  void: (id: string, reason: string) => apiClient.post<GiftVoucherResponse>(`/api/gift-vouchers/${id}/void`, { reason }),
  adjust: (id: string, delta: number, reason: string) =>
    apiClient.post<GiftVoucherResponse>(`/api/gift-vouchers/${id}/adjust`, { delta, reason }),
};
