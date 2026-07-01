import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { CheckCircle2, CircleAlert, Loader2 } from 'lucide-react';
import { apiClient } from '@/services/api';
import { useSeo } from '@/hooks/useSeo';

export const Route = createFileRoute('/orders/confirm-received')({
  validateSearch: z.object({
    order_id: z.string().default(''),
    token: z.string().default(''),
  }),
  component: ConfirmReceivedPage,
});

function ConfirmReceivedPage() {
  const { order_id, token } = Route.useSearch();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useSeo({
    title: 'Confirm Order Received',
    description: 'Confirm that your Bagstreet package has arrived.',
    canonicalPath: '/orders/confirm-received',
  });

  useEffect(() => {
    if (!order_id || !token) {
      setStatus('error');
      setMessage('This confirmation link is missing required details.');
      return;
    }

    let mounted = true;
    apiClient.post(`/api/orders/${order_id}/confirm-received`, { token })
      .then((res) => {
        if (!mounted) return;
        setStatus('success');
        setMessage(res.message || 'Thanks, your order has been marked as received.');
      })
      .catch((err) => {
        if (!mounted) return;
        setStatus('error');
        setMessage(err?.message || 'This confirmation link is invalid or has expired.');
      });

    return () => { mounted = false; };
  }, [order_id, token]);

  const isSuccess = status === 'success';
  const Icon = status === 'loading' ? Loader2 : isSuccess ? CheckCircle2 : CircleAlert;

  return (
    <div className="min-h-[80vh] px-4 py-24">
      <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <Icon
          className={`mx-auto h-10 w-10 ${status === 'loading' ? 'animate-spin text-muted-foreground' : isSuccess ? 'text-primary' : 'text-destructive'}`}
          strokeWidth={1.8}
        />
        <h1 className="mt-5 text-2xl font-semibold">
          {status === 'loading' ? 'Confirming receipt' : isSuccess ? 'Order received' : 'Could not confirm'}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {message || 'Please wait while we update your order.'}
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}
