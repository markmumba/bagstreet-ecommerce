import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CartQuoteRequestItem, RecoveryPreferencesResponse } from 'shared';
import { apiClient } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { cartKeys, useCart, type StorefrontCart } from './useCart';

let syncQueue: Promise<unknown> = Promise.resolve();

/** Serialize snapshots so a slow earlier request cannot overwrite a later edit or checkout. */
export function syncRecoveryBag(items: CartQuoteRequestItem[], options: { email?: string; consent?: boolean; touch?: boolean } = {}) {
  const request = { items, ...options };
  const pending = syncQueue.catch(() => undefined).then(() => apiClient.post('/api/cart-recovery/sync', request));
  syncQueue = pending;
  return pending;
}

export function useRecoveryPreferences() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['recovery-preferences', user?.email],
    queryFn: () => apiClient.get<RecoveryPreferencesResponse>('/api/cart-recovery/preferences'),
    enabled: Boolean(user), staleTime: 60_000, retry: false,
  });
}

export function useSetRecoveryPreferences() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (recovery_opt_in: boolean) => apiClient.patch<RecoveryPreferencesResponse>('/api/cart-recovery/preferences', { recovery_opt_in }),
    onSuccess: response => {
      qc.setQueryData(['recovery-preferences', user?.email], response);
      const cart = qc.getQueryData<{ data: StorefrontCart }>(cartKeys.all);
      if (cart) void syncRecoveryBag(cart.data.items.map(item => ({ variant_id: item.variant_id, quantity: item.quantity }))).catch(() => undefined);
    },
  });
}

export function useCartRecoverySync() {
  const { user, isLoading } = useAuth();
  const { data: cart } = useCart();
  // Price reconciliation and query refetches do not count as customer activity.
  const signature = cart ? JSON.stringify(cart.data.items.map(item => ({ variant_id: item.variant_id, quantity: item.quantity })).sort((a, b) => a.variant_id - b.variant_id)) : undefined;
  useEffect(() => {
    if (isLoading || signature === undefined) return;
    const timer = window.setTimeout(() => {
      void syncRecoveryBag(JSON.parse(signature) as CartQuoteRequestItem[]).catch(() => undefined);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [signature, user?.email, isLoading]);
}
