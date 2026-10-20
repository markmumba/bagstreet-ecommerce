import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** The message from a failed request, or a fallback that says what to do next. */
export function errorMessage(error: unknown, fallback: string): string {
  const message = (error as { message?: string } | null)?.message;
  return message && message !== 'An unexpected error occurred' ? message : fallback;
}

/** An error shown where it happened (in a form or dialog), announced to screen readers. */
export function ErrorNotice({ children, className }: { children: ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <p role="alert" className={cn('rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive', className)}>
      {children}
    </p>
  );
}

/** A confirmation (e.g. "Saved"), announced politely. */
export function SuccessNotice({ children, className }: { children: ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <p role="status" className={cn('rounded-lg border border-[var(--color-success-border)] bg-[var(--color-success-bg)] px-3 py-2 text-sm text-[var(--color-success-text)]', className)}>
      {children}
    </p>
  );
}
