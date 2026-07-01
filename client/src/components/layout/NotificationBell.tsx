import { useRef, useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { useNotifications, useMarkRead, useMarkAllRead } from '@/hooks/useNotifications';
import type { NotificationItem } from '@/services/notifications.service';

type NotificationData = Exclude<NotificationItem['data'], string | null>;

function relativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

const notificationTargets = new Set([
    '/dashboard',
    '/orders',
    '/products',
    '/categories',
    '/promotions',
    '/shipping',
    '/users',
    '/settings',
]);

function normalizeNotificationData(data: NotificationItem['data']): NotificationData | null {
    if (!data) return null;
    if (typeof data === 'string') {
        try {
            const parsed = JSON.parse(data);
            return parsed && typeof parsed === 'object' ? parsed as NotificationData : null;
        } catch {
            return null;
        }
    }
    return data;
}

export function NotificationBell() {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    const { data: notifications = [] } = useNotifications();
    const markRead = useMarkRead();
    const markAllRead = useMarkAllRead();

    const unreadCount = notifications.filter((n) => !n.is_read).length;

    // Close on outside click
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        if (open) document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    function handleNotifClick(notif: NotificationItem) {
        if (!notif.is_read) {
            markRead.mutate(notif.id);
        }
        setOpen(false);
        const data = normalizeNotificationData(notif.data);
        const target = typeof data?.link === 'string' ? data.link : notif.type === 'NEW_ORDER' ? '/orders' : '';
        if (notificationTargets.has(target)) {
            if (target === '/orders' && data?.order_id != null) {
                navigate({ to: '/orders', search: { order_id: String(data.order_id) } as any });
            } else {
                navigate({ to: target as any });
            }
        }
    }

    return (
        <div ref={ref} className="relative">
            <Button
                variant="ghost"
                size="sm"
                className="relative h-8 w-8 p-0"
                onClick={() => setOpen((o) => !o)}
                aria-label="Notifications"
            >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </Button>

            {open && (
                <div className="absolute right-0 top-10 z-[100] w-80 rounded-md border border-border bg-background shadow-lg">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-border px-4 py-2">
                        <span className="text-sm font-medium">Notifications</span>
                        {unreadCount > 0 && (
                            <button
                                className="text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => markAllRead.mutate()}
                            >
                                Mark all read
                            </button>
                        )}
                    </div>

                    {/* List */}
                    <div className="max-h-80 overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                                No notifications
                            </div>
                        ) : (
                            notifications.map((notif) => (
                                <button
                                    key={notif.id}
                                    className="flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left hover:bg-muted/50 last:border-0"
                                    onClick={() => handleNotifClick(notif)}
                                >
                                    {/* Unread dot */}
                                    <span
                                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                                            notif.is_read ? 'bg-transparent' : 'bg-primary'
                                        }`}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className={`text-sm leading-snug ${notif.is_read ? 'text-muted-foreground' : 'font-medium text-foreground'}`}>
                                            {notif.title}
                                        </p>
                                        {notif.body && (
                                            <p className="mt-0.5 text-xs text-muted-foreground truncate">{notif.body}</p>
                                        )}
                                        <p className="mt-1 text-xs text-muted-foreground/70">
                                            {relativeTime(notif.created_at)}
                                        </p>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
