import { createFileRoute, Link } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { apiClient } from '@/services/api';
import { useSeo } from '@/hooks/useSeo';
import { useRecoveryPrivacy } from '@/hooks/useRecoveryPrivacy';

export const Route = createFileRoute('/email-preferences')({
  validateSearch: z.object({ id: z.string().optional(), token: z.string().optional() }), component: EmailPreferencesPage,
});

function EmailPreferencesPage() {
  useRecoveryPrivacy();
  useSeo({ title: 'Email preferences', canonicalPath: '/email-preferences' });
  const { id, token } = Route.useSearch();
  const unsubscribe = useMutation({ mutationFn: () => apiClient.post('/api/cart-recovery/unsubscribe', { id, token }) });
  return (
    <div className="mx-auto max-w-xl px-4 pb-24 pt-32 sm:px-8 sm:pt-40">
      <h1 className="text-3xl font-normal" style={{ fontFamily: 'var(--font-display)' }}>{unsubscribe.isSuccess ? "You're unsubscribed" : 'Bag reminder emails'}</h1>
      <p className="mt-5 text-sm leading-6 text-muted-foreground">{unsubscribe.isSuccess ? "You won't receive reminders about unfinished shopping. Your order confirmations, receipts and delivery emails will continue." : 'Stop emails about unfinished shopping. Your order confirmations, receipts and delivery emails will continue.'}</p>
      {!unsubscribe.isSuccess && <button type="button" disabled={!id || !token || unsubscribe.isPending} onClick={() => unsubscribe.mutate()}
        className="ui-press mt-7 min-h-12 bg-primary px-6 py-3 text-sm text-primary-foreground disabled:opacity-40">
        {unsubscribe.isPending ? 'Unsubscribing...' : 'Unsubscribe from bag reminders'}
      </button>}
      {(!id || !token || unsubscribe.isError) && <p role="alert" className="mt-4 text-sm text-destructive">This unsubscribe link is invalid. Contact BagStreet and we'll update your preference.</p>}
      <Link to="/shop" className="mt-8 block text-sm underline underline-offset-4">Back to the shop</Link>
    </div>
  );
}
