import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsService, type OrderHandoverUpdate } from '@/services/settings.service';

export const settingsKeys = {
  all: ['settings'] as const,
  orderHandover: () => [...settingsKeys.all, 'order-handover'] as const,
};

export function useOrderHandoverSettings() {
  return useQuery({
    queryKey: settingsKeys.orderHandover(),
    queryFn: async () => settingsService.getOrderHandover(),
  });
}

export function useUpdateOrderHandoverSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: OrderHandoverUpdate) => settingsService.updateOrderHandover(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.orderHandover() });
    },
  });
}
