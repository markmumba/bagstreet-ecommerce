import { apiClient } from './api';
import type { ShippingLocationResponse, ShippingLocationRequest } from 'shared';
import type { ImportReport } from '@/components/import/CsvImportDialog';

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

    importCsv: async (file: File) => {
        const data = new FormData();
        data.append('file', file);
        return apiClient.postForm<ImportReport>('/api/shipping-locations/import', data);
    },
};
