import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsService } from '@/services/notifications.service';

export const notificationKeys = {
    all: ['notifications'] as const,
    list: () => [...notificationKeys.all, 'list'] as const,
};

export function useNotifications(page = 1, limit = 20) {
    return useQuery({
        queryKey: notificationKeys.list(),
        queryFn: async () => {
            const response = await notificationsService.getAll(page, limit);
            return response.data ?? [];
        },
        staleTime: 0,
    });
}

export function useMarkRead() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => notificationsService.markRead(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: notificationKeys.all });
        },
    });
}

export function useMarkAllRead() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => notificationsService.markAllRead(),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: notificationKeys.all });
        },
    });
}

export function useNotificationStream() {
    const queryClient = useQueryClient();

    useEffect(() => {
        const token = localStorage.getItem('bagstreet_token');
        if (!token) return;

        const baseUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';
        const es = new EventSource(`${baseUrl}/api/notifications/stream?token=${encodeURIComponent(token)}`);

        const onNotification = () => {
            queryClient.invalidateQueries({ queryKey: notificationKeys.all });
        };

        es.addEventListener('notification', onNotification);
        es.addEventListener('init', onNotification);

        es.onerror = () => {
            es.close();
        };

        return () => es.close();
    }, [queryClient]);
}
