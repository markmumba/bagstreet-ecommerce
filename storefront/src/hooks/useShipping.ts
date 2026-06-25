import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/services/api';
import type { ShippingLocationResponse } from 'shared';

export function useActiveShippingLocations() {
    return useQuery({
        queryKey: ['shipping-locations'],
        queryFn: () => apiClient.get<ShippingLocationResponse[]>('/api/shipping-locations'),
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
}
