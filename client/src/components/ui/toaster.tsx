import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { dismissToast, subscribeToasts, type Toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => subscribeToasts(setToasts), []);

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:items-end">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className={cn(
            'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-[var(--shadow-dropdown)]',
            t.kind === 'error'
              ? 'border-destructive/30 bg-background text-destructive'
              : 'border-[var(--color-success-border)] bg-background text-foreground',
          )}
        >
          <span className="min-w-0 flex-1 break-words">{t.message}</span>
          <button type="button" onClick={() => dismissToast(t.id)} aria-label="Dismiss" className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
