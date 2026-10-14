import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GiftVoucherIssueRequest } from 'shared';
import { giftVouchersService, type GiftVoucherFilters } from '@/services/gift-vouchers.service';

export const giftVoucherKeys = {
  all: ['gift-vouchers'] as const,
  list: (filters: GiftVoucherFilters) => ['gift-vouchers', 'list', filters] as const,
  detail: (id: string) => ['gift-vouchers', 'detail', id] as const,
  summary: ['gift-vouchers', 'summary'] as const,
};

export function useGiftVouchers(filters: GiftVoucherFilters) {
  return useQuery({
    queryKey: giftVoucherKeys.list(filters),
    queryFn: () => giftVouchersService.list(filters),
    placeholderData: keepPreviousData,
  });
}

export function useGiftVoucher(id: string | null) {
  return useQuery({
    queryKey: giftVoucherKeys.detail(id ?? ''),
    queryFn: () => giftVouchersService.get(id!),
    enabled: Boolean(id),
  });
}

export function useGiftVoucherSummary(enabled: boolean) {
  return useQuery({ queryKey: giftVoucherKeys.summary, queryFn: () => giftVouchersService.summary(), enabled });
}

export function useLookupGiftVoucher() {
  return useMutation({ mutationFn: (code: string) => giftVouchersService.lookup(code) });
}

/** Issuing, cancelling and adjusting change the list, the balances and the liability. */
function useVoucherMutation<T>(mutationFn: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: giftVoucherKeys.all }),
  });
}

export function useIssueGiftVoucher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: GiftVoucherIssueRequest) => giftVouchersService.issue(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: giftVoucherKeys.all }),
  });
}

export const useVoidGiftVoucher = () =>
  useVoucherMutation(({ id, reason }: { id: string; reason: string }) => giftVouchersService.void(id, reason));

export const useAdjustGiftVoucher = () =>
  useVoucherMutation(({ id, delta, reason }: { id: string; delta: number; reason: string }) =>
    giftVouchersService.adjust(id, delta, reason));
