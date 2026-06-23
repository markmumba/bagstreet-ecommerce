import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { variantsService } from '@/services/variants.service';
import type { ProductVariantRequest } from 'shared';

export const variantKeys = {
  all: (productId: string) => ['variants', productId] as const,
};

export function useProductVariants(productId: string) {
  return useQuery({
    queryKey: variantKeys.all(productId),
    queryFn: async () => {
      const response = await variantsService.getAll(productId);
      return response.data || [];
    },
    enabled: !!productId,
  });
}

export function useCreateVariant(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ProductVariantRequest) => variantsService.create(productId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: variantKeys.all(productId) });
    },
  });
}

export function useUpdateVariant(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ variantId, data }: { variantId: string; data: Partial<ProductVariantRequest> }) =>
      variantsService.update(productId, variantId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: variantKeys.all(productId) });
    },
  });
}

export function useDeleteVariant(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variantId: string) => variantsService.delete(productId, variantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: variantKeys.all(productId) });
    },
  });
}
