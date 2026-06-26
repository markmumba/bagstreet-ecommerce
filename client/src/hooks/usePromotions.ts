import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { promotionsService, type DiscountCodeInput } from '@/services/promotions.service';

export const promotionKeys = {
  discounts: ['promotions', 'discounts'] as const,
  threshold: ['promotions', 'free-delivery-threshold'] as const,
  sales: ['promotions', 'sales'] as const,
};

export function useDiscountCodes() {
  return useQuery({
    queryKey: promotionKeys.discounts,
    queryFn: async () => promotionsService.getDiscounts(),
  });
}

export function useCreateDiscountCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DiscountCodeInput) => promotionsService.createDiscount(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: promotionKeys.discounts }),
  });
}

export function useUpdateDiscountCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<DiscountCodeInput> }) =>
      promotionsService.updateDiscount(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: promotionKeys.discounts }),
  });
}

export function useDeactivateDiscountCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => promotionsService.deactivateDiscount(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: promotionKeys.discounts }),
  });
}

export function useFreeDeliveryThreshold() {
  return useQuery({
    queryKey: promotionKeys.threshold,
    queryFn: async () => promotionsService.getFreeDeliveryThreshold(),
  });
}

export function useUpdateFreeDeliveryThreshold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (threshold: number) => promotionsService.updateFreeDeliveryThreshold(threshold),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: promotionKeys.threshold }),
  });
}

export function useOnSaleProducts() {
  return useQuery({
    queryKey: promotionKeys.sales,
    queryFn: async () => promotionsService.getOnSaleProducts(),
  });
}

export function useSetProductSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { sale_price: number | null; sale_ends_at?: string | null } }) =>
      promotionsService.setProductSale(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promotionKeys.sales });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
