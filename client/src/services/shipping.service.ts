import { apiClient } from './api';
import type { ShippingLocationResponse, ShippingLocationRequest } from 'shared';

export const shippingService = {
    getAll: async () => {
        return apiClient.get<ShippingLocationResponse[]>('/api/shipping-locations/all');
    },

    create: async (data: ShippingLocationRequest) => {
        return apiClient.post<ShippingLocationResponse>('/api/shipping-locations', data);
    },

    update: async (id: string, data: Partial<ShippingLocationRequest>) => {
        return apiClient.put<ShippingLocationResponse>(`/api/shipping-locations/${id}`, data);
    },

    delete: async (id: string) => {
        return apiClient.delete<void>(`/api/shipping-locations/${id}`);
    },
};
