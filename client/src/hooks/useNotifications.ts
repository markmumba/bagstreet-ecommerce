import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsService } from '@/services/notifications.service';
import { apiClient } from '@/services/api';

export const notificationKeys = {
    all: ['notifications'] as const,
    list: () => [...notificationKeys.all, 'list'] as const,
};

export function useNotifications(page = 1, limit = 20) {
    return useQuery({
        queryKey: notificationKeys.list(),
        queryFn: async () => (await notificationsService.getAll(page, limit)).items,
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
        const baseUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';
        let es: EventSource | null = null;
        let retry: ReturnType<typeof setTimeout> | undefined;
        let stopped = false;

        const onNotification = () => {
            queryClient.invalidateQueries({ queryKey: notificationKeys.all });
        };

        // The server ends the stream when the access token expires, so reconnect with a fresh one.
        const connect = (token: string | null) => {
            if (stopped || !token) return;
            es = new EventSource(`${baseUrl}/api/notifications/stream?token=${encodeURIComponent(token)}`);
            es.addEventListener('notification', onNotification);
            es.addEventListener('init', onNotification);
            es.onerror = () => {
                es?.close();
                retry = setTimeout(() => apiClient.refreshSession().then(connect), 5000);
            };
        };

        connect(apiClient.getAuthToken());

        return () => {
            stopped = true;
            clearTimeout(retry);
            es?.close();
        };
    }, [queryClient]);
}
