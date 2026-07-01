import { apiClient } from './api';

export interface NotificationItem {
    id: string;
    type: string;
    title: string;
    body: string | null;
    data: { link?: unknown; order_id?: string | number; variant_id?: string | number } | string | null;
    is_read: boolean;
    created_at: string;
}

export const notificationsService = {
    getAll: async (page = 1, limit = 20) => {
        return apiClient.get<NotificationItem[]>('/api/notifications', { page, limit });
    },

    markRead: async (id: string) => {
        return apiClient.patch<{ id: string }>(`/api/notifications/${id}/read`);
    },

    markAllRead: async () => {
        return apiClient.patch<null>('/api/notifications/read-all');
    },
};
