import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ShoppingBag } from 'lucide-react';
import { z } from 'zod';
import type { CartRecoveryResponse } from 'shared';
import { apiClient } from '@/services/api';
import { useCart, useRestoreCart } from '@/hooks/useCart';
import { useSeo } from '@/hooks/useSeo';
import { formatPrice } from '@/lib/format';
import { useRecoveryPrivacy } from '@/hooks/useRecoveryPrivacy';

export const Route = createFileRoute('/recover-bag')({
  validateSearch: z.object({ token: z.string().optional() }), component: RecoverBagPage,
});

function RecoverBagPage() {
  useRecoveryPrivacy();
  useSeo({ title: 'Your saved bag', canonicalPath: '/recover-bag' });
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const cart = useCart();
  const restore = useRestoreCart();
  const recovery = useQuery({
    queryKey: ['cart-recovery', token], queryFn: () => apiClient.get<CartRecoveryResponse>('/api/cart-recovery/bag', { token }),
    enabled: Boolean(token), retry: false, staleTime: 0,
  });
  const saved = recovery.data?.data;
  const hasExistingBag = Boolean(cart.data?.data.items.length);
  const disabled = restore.isPending || !saved?.quote?.item_count;
  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-28 sm:px-8 sm:pt-36">
      <h1 className="text-3xl font-normal" style={{ fontFamily: 'var(--font-display)' }}>Your saved bag</h1>
      {recovery.isLoading && token ? <p role="status" className="mt-6">Checking today's prices and availability...</p> : null}
      {(!token || recovery.isError) && <p role="alert" className="mt-6">This saved bag link is invalid or has expired. Your order history is still available in your account.</p>}
      {saved?.state === 'completed' && <p className="mt-6">This checkout no longer needs a reminder. Any payment already received will not be charged again here.</p>}
      {saved?.state === 'payment_pending' && <p className="mt-6">You have an active checkout. Please check its payment status on the original device, or contact us before placing another order.</p>}
      {saved?.state === 'ready' && saved.quote && <>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">These are today's prices. Items aren't reserved. Unavailable items will be left out, and quantities will be limited to current stock.</p>
        <ul className="mt-8 divide-y divide-border border-y border-border">
          {saved.quote.lines.map(line => <li key={line.variant_id} className="flex items-start gap-4 py-5">
            <div className="flex h-24 w-20 shrink-0 items-center justify-center overflow-hidden bg-muted">
              {line.image_url ? <img src={line.image_url} alt={line.product_name ?? 'Product'} width="80" height="96" className="h-full w-full object-cover" /> : <ShoppingBag className="h-6 w-6 text-muted-foreground" />}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-medium break-words">{line.product_name ?? 'Unavailable item'}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{[line.size, line.color].filter(Boolean).join(' / ')}</p>
              <p className={`mt-2 text-sm ${line.status === 'ok' ? 'text-muted-foreground' : 'text-destructive'}`}>
                {line.status === 'ok' ? `${line.purchasable_quantity} available for your bag` : line.purchasable_quantity ? `${line.purchasable_quantity} of ${line.requested_quantity} available` : 'Currently unavailable'}
              </p>
              {line.unit_price !== null && <p className="mt-2 text-sm font-medium tabular-nums">{formatPrice(line.unit_price)} each</p>}
            </div>
          </li>)}
        </ul>
        {hasExistingBag && <p className="mt-5 text-sm text-muted-foreground">Restoring this bag will replace the items currently in your bag.</p>}
        <button type="button" disabled={disabled} onClick={() => restore.mutate(token!, { onSuccess: () => navigate({ to: '/cart' }) })}
          className="ui-press mt-6 inline-flex min-h-12 items-center gap-2 bg-primary px-6 py-3 text-sm text-primary-foreground disabled:opacity-40">
          <ShoppingBag className="h-4 w-4" />{restore.isPending ? 'Restoring...' : hasExistingBag ? 'Replace my bag' : 'Restore my bag'}
        </button>
        {restore.isError && <p role="alert" className="mt-3 text-sm text-destructive">{restore.error.message || 'Your bag could not be restored. Please refresh and try again.'}</p>}
        {saved.quote.item_count === 0 && <p className="mt-4 text-sm">These items are currently unavailable.</p>}
      </>}
      <div className="mt-8 flex flex-wrap gap-6 text-sm">
        <Link to="/shop" className="underline underline-offset-4">Continue shopping</Link>
        <a href="https://wa.me/254748096887" className="underline underline-offset-4" rel="noreferrer">Contact BagStreet</a>
      </div>
    </div>
  );
}
