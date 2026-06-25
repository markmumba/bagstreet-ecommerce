import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { shippingService } from '@/services/shipping.service';
import type { ShippingLocationRequest } from 'shared';

const QUERY_KEY = ['shipping-locations'] as const;

export function useShippingLocations() {
    return useQuery({
        queryKey: QUERY_KEY,
        queryFn: async () => {
            const res = await shippingService.getAll();
            return res.data ?? [];
        },
    });
}

export function useCreateShippingLocation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data: ShippingLocationRequest) => shippingService.create(data),
        onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
    });
}

export function useUpdateShippingLocation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<ShippingLocationRequest> }) =>
            shippingService.update(id, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
    });
}

export function useDeleteShippingLocation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => shippingService.delete(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
    });
}
