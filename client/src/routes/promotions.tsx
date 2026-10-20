import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { WandSparkles } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  useCreateDiscountCode,
  useDiscountCodes,
  useFreeDeliveryThreshold,
  useOnSaleProducts,
  useSetProductSale,
  useUpdateFreeDeliveryThreshold,
  useUpdateDiscountCode,
} from '@/hooks/usePromotions';
import { formatDate as formatDay, formatMoney } from '@/lib/format';
import type { ProductResponse } from 'shared';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ErrorNotice, errorMessage } from '@/components/ui/notice';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/lib/toast';

export const Route = createFileRoute('/promotions')({
  component: PromotionsPage,
});

const formatPrice = (price: number) => formatMoney(price);

function formatDate(value?: string) {
  if (!value) return 'No expiry';
  return formatDay(value);
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
  const updateThreshold = useUpdateFreeDeliveryThreshold();
  const setProductSale = useSetProductSale();

  const discounts = discountsRes ?? [];
  const sales = salesRes ?? [];
  const threshold = thresholdRes?.threshold ?? 0;

  const [form, setForm] = useState({
    code: '',
    value: '',
    min_order_amount: '0',
    usage_limit: '',
    expires_at: '',
    requires_account: true,
  });
  const [thresholdInput, setThresholdInput] = useState('');
  const [discountError, setDiscountError] = useState('');
  const [thresholdError, setThresholdError] = useState('');
  const [endingSale, setEndingSale] = useState<ProductResponse | null>(null);

  const handleGenerateCode = () => {
    setForm((f) => ({ ...f, code: generatePromoCode() }));
  };

  const submitDiscount = async (event: React.FormEvent) => {
    event.preventDefault();
    setDiscountError('');
    try {
      await createDiscount.mutateAsync({
        code: form.code.trim(),
        value: Number(form.value),
        min_order_amount: Number(form.min_order_amount || 0),
        usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
        is_active: true,
        requires_account: form.requires_account,
      });
      setForm({ code: '', value: '', min_order_amount: '0', usage_limit: '', expires_at: '', requires_account: true });
    } catch (err) {
      setDiscountError(errorMessage(err, 'Could not create the code. Check the details and try again.'));
    }
  };

  const submitThreshold = async (event: React.FormEvent) => {
    event.preventDefault();
    setThresholdError('');
    try {
      await updateThreshold.mutateAsync(Number(thresholdInput || 0));
      setThresholdInput('');
    } catch (err) {
      setThresholdError(errorMessage(err, 'Could not save the threshold. Check your connection and try again.'));
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-semibold leading-tight">Promotions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage discount codes, free delivery, and flash sales</p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <div className="space-y-6">
            <form onSubmit={submitDiscount} className="rounded-xl border bg-card p-4">
              <h2 className="text-sm font-semibold">Create promo code</h2>
              <div className="mt-4 grid gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="promo-code">Code</Label>
                  <div className="flex gap-2">
                    <Input
                      id="promo-code"
                      value={form.code}
                      onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                      placeholder="e.g. INSTA10"
                      spellCheck={false}
                      autoComplete="off"
                      autoCapitalize="characters"
                      className="h-10 flex-1"
                      required
                    />
                    <Button type="button" variant="outline" onClick={handleGenerateCode}>
                      <WandSparkles className="h-4 w-4" />
                      Generate
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="promo-value">Percent off</Label>
                    <Input
                      id="promo-value"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max="100"
                      step="0.01"
                      value={form.value}
                      onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                      placeholder="e.g. 10"
                      className="h-10"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="promo-min-order">Minimum order</Label>
                    <Input
                      id="promo-min-order"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      value={form.min_order_amount}
                      onChange={(e) => setForm((f) => ({ ...f, min_order_amount: e.target.value }))}
                      placeholder="0 for no minimum"
                      className="h-10"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="promo-usage-limit">Usage limit (optional)</Label>
                    <Input
                      id="promo-usage-limit"
                      type="number"
                      inputMode="numeric"
                      min="1"
                      value={form.usage_limit}
                      onChange={(e) => setForm((f) => ({ ...f, usage_limit: e.target.value }))}
                      placeholder="Blank for no limit"
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="promo-expires-at">Expires on (optional)</Label>
                    <Input
                      id="promo-expires-at"
                      type="date"
                      value={form.expires_at}
                      onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))}
                      className="h-10"
                    />
                  </div>
                </div>
                <label htmlFor="promo-requires-account" className="flex items-start gap-2 text-sm">
                  <input
                    id="promo-requires-account"
                    type="checkbox"
                    checked={form.requires_account}
                    onChange={(e) => setForm((f) => ({ ...f, requires_account: e.target.checked }))}
                    className="mt-0.5 h-4 w-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  />
                  <span>
                    Customers must be signed in
                    <span className="block text-xs text-muted-foreground">
                      Each account can use the code once. Turn off for a code you send to one person.
                    </span>
                  </span>
                </label>
                <ErrorNotice>{discountError}</ErrorNotice>
                <Button type="submit" disabled={createDiscount.isPending}>
                  {createDiscount.isPending ? 'Creating…' : 'Create code'}
                </Button>
              </div>
            </form>

            <form onSubmit={submitThreshold} className="rounded-xl border bg-card p-4">
              <h2 className="text-sm font-semibold">Free delivery threshold</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Current: {threshold > 0 ? formatPrice(threshold) : 'Disabled'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Judged on the bag subtotal before any discount code.
              </p>
              <div className="mt-4 space-y-1.5">
                <Label htmlFor="free-delivery-threshold">New threshold</Label>
                <div className="flex gap-2">
                  <Input
                    id="free-delivery-threshold"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={thresholdInput}
                    onChange={(e) => setThresholdInput(e.target.value)}
                    placeholder="0 disables it"
                    className="h-10 flex-1"
                  />
                  <Button type="submit" disabled={updateThreshold.isPending}>
                    {updateThreshold.isPending ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </div>
              <ErrorNotice className="mt-3">{thresholdError}</ErrorNotice>
            </form>
          </div>

          <div className="space-y-6">
            <section className="rounded-xl border bg-card">
              <div className="border-b px-4 py-3">
                <h2 className="text-sm font-semibold">Promo codes</h2>
              </div>
              <div className="divide-y">
                {discountsLoading && <p className="p-4 text-sm text-muted-foreground">Loading codes…</p>}
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
                        <Badge variant="neutral">{discount.requires_account ? 'signed-in only' : 'anyone'}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {discount.value}% off · min {formatPrice(discount.min_order_amount)} · used {discount.used_count}
                        {discount.usage_limit ? ` / ${discount.usage_limit}` : ''} · {formatDate(discount.expires_at)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {/* Pausing is undone with one tap, so it isn't confirmed. */}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={updateDiscount.isPending}
                        onClick={() => updateDiscount.mutate(
                          { id: discount.id, data: { is_active: !discount.is_active } },
                          {
                            onSuccess: () => toast.success(`${discount.code} is ${discount.is_active ? 'paused' : 'active again'}.`),
                            onError: (err) => toast.error(errorMessage(err, `${discount.code} could not be updated. Try again.`)),
                          },
                        )}
                      >
                        {discount.is_active ? 'Pause' : 'Activate'}
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
                    <Button size="sm" variant="outline" onClick={() => setEndingSale(product)}>
                      End sale
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={!!endingSale}
        onOpenChange={(open) => !open && setEndingSale(null)}
        title="End this sale?"
        description={endingSale ? <>{endingSale.name} goes back to {formatPrice(endingSale.price)} on the storefront straight away.</> : ''}
        confirmLabel="End sale"
        pendingLabel="Ending sale…"
        onConfirm={() => setProductSale.mutateAsync({ id: endingSale!.id, data: { sale_price: null } })}
      />
    </DashboardLayout>
  );
}
