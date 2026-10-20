/**
 * Short messages for actions that have no form to show them in (an export, a print).
 * `<Toaster />` (mounted once in the root route) renders them in a live region.
 */
export type ToastKind = 'success' | 'error';
export interface Toast { id: number; kind: ToastKind; message: string }

type Listener = (toasts: Toast[]) => void;
let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener(toasts);
}

function show(kind: ToastKind, message: string) {
  const id = nextId++;
  toasts = [...toasts, { id, kind, message }].slice(-3);
  emit();
  window.setTimeout(() => dismissToast(id), kind === 'error' ? 8000 : 4000);
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener(toasts);
  return () => listeners.delete(listener);
}

export const toast = {
  success: (message: string) => show('success', message),
  error: (message: string) => show('error', message),
};
