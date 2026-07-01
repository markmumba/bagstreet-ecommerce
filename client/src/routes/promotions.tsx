import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { WandSparkles } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  useCreateDiscountCode,
  useDeactivateDiscountCode,
  useDiscountCodes,
  useFreeDeliveryThreshold,
  useOnSaleProducts,
  useSetProductSale,
  useUpdateFreeDeliveryThreshold,
  useUpdateDiscountCode,
} from '@/hooks/usePromotions';
import type { DiscountCodeResponse, ProductResponse } from 'shared';

export const Route = createFileRoute('/promotions')({
  component: PromotionsPage,
});

function formatPrice(price: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(price);
}

function formatDate(value?: string) {
  if (!value) return 'No expiry';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function generatePromoCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `BAG${suffix}`;
}

function PromotionsPage() {
  const { data: discountsRes, isLoading: discountsLoading } = useDiscountCodes();
  const { data: thresholdRes } = useFreeDeliveryThreshold();
  const { data: salesRes } = useOnSaleProducts();
  const createDiscount = useCreateDiscountCode();
  const updateDiscount = useUpdateDiscountCode();
  const deactivateDiscount = useDeactivateDiscountCode();
  const updateThreshold = useUpdateFreeDeliveryThreshold();
  const setProductSale = useSetProductSale();

  const discounts = (discountsRes?.data ?? []) as DiscountCodeResponse[];
  const sales = (salesRes?.data ?? []) as ProductResponse[];
  const threshold = thresholdRes?.data?.threshold ?? 0;

  const [form, setForm] = useState({
    code: '',
    value: '',
    min_order_amount: '0',
    usage_limit: '',
    expires_at: '',
  });
  const [thresholdInput, setThresholdInput] = useState('');
  const [error, setError] = useState('');

  const handleGenerateCode = () => {
    setForm((f) => ({ ...f, code: generatePromoCode() }));
  };

  const submitDiscount = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await createDiscount.mutateAsync({
        code: form.code.trim(),
        value: Number(form.value),
        min_order_amount: Number(form.min_order_amount || 0),
        usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
        is_active: true,
      });
      setForm({ code: '', value: '', min_order_amount: '0', usage_limit: '', expires_at: '' });
    } catch (err: any) {
      setError(err?.message || 'Failed to create discount code');
    }
  };

  const submitThreshold = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await updateThreshold.mutateAsync(Number(thresholdInput || 0));
      setThresholdInput('');
    } catch (err: any) {
      setError(err?.message || 'Failed to update threshold');
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold leading-tight">Promotions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage discount codes, free delivery, and flash sales</p>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <div className="space-y-6">
            <form onSubmit={submitDiscount} className="rounded-xl border bg-card p-4">
              <h2 className="text-sm font-semibold">Create promo code</h2>
              <div className="mt-4 grid gap-3">
                <div className="flex gap-2">
                  <input
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                    placeholder="Code, e.g. INSTA10"
                    className="h-10 flex-1 rounded-md border bg-background px-3 text-sm"
                    required
                  />
                  <Button type="button" variant="outline" onClick={handleGenerateCode}>
                    <WandSparkles className="h-4 w-4" />
                    Generate
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={form.value}
                    onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                    placeholder="% off"
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                    required
                  />
                  <input
                    type="number"
                    min="0"
                    value={form.min_order_amount}
                    onChange={(e) => setForm((f) => ({ ...f, min_order_amount: e.target.value }))}
                    placeholder="Min order"
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    min="1"
                    value={form.usage_limit}
                    onChange={(e) => setForm((f) => ({ ...f, usage_limit: e.target.value }))}
                    placeholder="Usage limit"
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                  />
                  <input
                    type="date"
                    value={form.expires_at}
                    onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))}
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                  />
                </div>
                <Button type="submit" disabled={createDiscount.isPending}>
                  {createDiscount.isPending ? 'Creating...' : 'Create Code'}
                </Button>
              </div>
            </form>

            <form onSubmit={submitThreshold} className="rounded-xl border bg-card p-4">
              <h2 className="text-sm font-semibold">Free delivery threshold</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Current: {threshold > 0 ? formatPrice(threshold) : 'Disabled'}
              </p>
              <div className="mt-4 flex gap-2">
                <input
                  type="number"
                  min="0"
                  value={thresholdInput}
                  onChange={(e) => setThresholdInput(e.target.value)}
                  placeholder="0 disables it"
                  className="h-10 flex-1 rounded-md border bg-background px-3 text-sm"
                />
                <Button type="submit" disabled={updateThreshold.isPending}>
                  Save
                </Button>
              </div>
            </form>
          </div>

          <div className="space-y-6">
            <section className="rounded-xl border bg-card">
              <div className="border-b px-4 py-3">
                <h2 className="text-sm font-semibold">Promo codes</h2>
              </div>
              <div className="divide-y">
                {discountsLoading && <p className="p-4 text-sm text-muted-foreground">Loading codes...</p>}
                {!discountsLoading && discounts.length === 0 && (
                  <p className="p-4 text-sm text-muted-foreground">No promo codes yet.</p>
                )}
                {discounts.map((discount) => (
                  <div key={discount.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold">{discount.code}</span>
                        <Badge variant={discount.is_active ? 'success' : 'neutral'}>
                          {discount.is_active ? 'active' : 'inactive'}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {discount.value}% off · min {formatPrice(discount.min_order_amount)} · used {discount.used_count}
                        {discount.usage_limit ? ` / ${discount.usage_limit}` : ''} · {formatDate(discount.expires_at)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateDiscount.mutate({ id: discount.id, data: { is_active: !discount.is_active } })}
                      >
                        {discount.is_active ? 'Pause' : 'Activate'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deactivateDiscount.mutate(discount.id)}
                        disabled={!discount.is_active}
                      >
                        Deactivate
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border bg-card">
              <div className="border-b px-4 py-3">
                <h2 className="text-sm font-semibold">Active flash sales</h2>
              </div>
              <div className="divide-y">
                {sales.length === 0 && <p className="p-4 text-sm text-muted-foreground">No products are currently on sale.</p>}
                {sales.map((product) => (
                  <div key={product.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{product.name}</span>
                        <Badge variant="warning">sale</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatPrice(product.sale_price ?? product.price)} from {formatPrice(product.price)} · {formatDate(product.sale_ends_at)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setProductSale.mutate({ id: product.id, data: { sale_price: null } })}
                    >
                      Remove sale
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
