import { createFileRoute, useNavigate, Link } from '@tanstack/react-router';
import { useEffect, useState, type ReactNode } from 'react';
import { z } from 'zod';
import { AlertCircle, Check, Lock } from 'lucide-react';
import type { ShippingLocationResponse } from 'shared';
import { useCart, useCartQuote, useClearCart } from '@/hooks/useCart';
import { useCompleteDevPayment, useInitiatePesapalPayment, usePaymentStatus, usePlaceOrder } from '@/hooks/useOrders';
import { useAuth } from '@/context/AuthContext';
import { useActiveShippingLocations } from '@/hooks/useShipping';
import { useValidateDiscountCode } from '@/hooks/usePromotions';
import { useSeo } from '@/hooks/useSeo';
import { formatPrice } from '@/lib/format';
import { SHOP_INFO } from '@/lib/shop-info';
import { clearPendingPayment, readPendingPayment, savePendingPayment } from '@/lib/pending-payment';

export const Route = createFileRoute('/checkout')({
  validateSearch: z.object({
    // `payment` is only Pesapal's redirect hint — the page always asks the server for the real status.
    payment: z.enum(['paid', 'pending', 'failed']).optional(),
    order_id: z.string().optional(),
    token: z.string().optional(),
  }),
  component: CheckoutPage,
});

type FormState = {
  full_name: string;
  email: string;
  phone: string;
  address_line1: string;
  address_line2: string;
  city: string;
  county: string;
  notes: string;
};

/** Locations are shown as a radio list when there are few, otherwise as a select. */
const MAX_RADIO_LOCATIONS = 8;

function CheckoutPage() {
  const search = Route.useSearch();
  useSeo({
    title: 'Checkout',
    description: 'Complete your Bagstreet order with guest checkout and secure Pesapal payment.',
    canonicalPath: '/checkout',
  });
  // Once an order exists (just placed, or back from Pesapal) the page is about paying for it.
  if (search.order_id) {
    return <PaymentView key={search.order_id} orderRef={search.order_id} urlToken={search.token} returnedFrom={search.payment} />;
  }
  return <CheckoutForm />;
}

// ── Payment / confirmation ─────────────────────────────────────────────────

function PaymentView({ orderRef, urlToken, returnedFrom }: { orderRef: string; urlToken?: string; returnedFrom?: 'paid' | 'pending' | 'failed' }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stored] = useState(readPendingPayment);
  const token = urlToken ?? (stored?.ref === orderRef ? stored.token : undefined);
  const statusQuery = usePaymentStatus(orderRef, token);
  const initiatePayment = useInitiatePesapalPayment();
  const completeDevPayment = useCompleteDevPayment();
  const [actionMessage, setActionMessage] = useState('');

  const info = statusQuery.data?.data;
  const state: 'loading' | 'unverified' | 'PAID' | 'PENDING' | 'FAILED' | 'EXPIRED' | 'REVIEW' =
    !token || statusQuery.isError ? 'unverified' : statusQuery.isLoading || !info ? 'loading' : info.status;

  // Settled orders no longer need resuming from this browser.
  useEffect(() => {
    if (state === 'PAID' || state === 'EXPIRED') clearPendingPayment(orderRef);
  }, [state, orderRef]);

  const orderLabel = info?.order_number ?? stored?.orderNumber ?? orderRef;
  const total = info?.total_amount ?? stored?.total;

  const startPayment = async () => {
    setActionMessage('');
    try {
      const res = await initiatePayment.mutateAsync({ order_ref: orderRef, token });
      if (res.data?.payment_redirect_url) {
        window.location.assign(res.data.payment_redirect_url);
        return;
      }
      setActionMessage('Payment could not start yet. Please try again shortly.');
    } catch (err: any) {
      setActionMessage(err?.message || 'We could not start payment. Please try again shortly.');
      statusQuery.refetch();
    }
  };

  const checkAgain = async () => {
    setActionMessage('');
    const res = await statusQuery.refetch();
    if (res.data?.data?.status === 'PENDING') setActionMessage(res.data.message || 'Payment has not been received yet.');
  };

  const devFinish = async () => {
    setActionMessage('');
    try {
      await completeDevPayment.mutateAsync({ order_ref: orderRef, token });
      statusQuery.refetch();
    } catch (err: any) {
      setActionMessage(err?.message || 'We could not complete the development payment.');
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto flex min-h-[80svh] items-center justify-center px-4 pt-[104px] pb-24 sm:px-8">
      <div className="w-full max-w-lg text-center">
        <Steps current={state === 'PAID' ? 3 : 2} />

        {state === 'loading' && (
          <>
            <p className="mt-12 text-label-caps text-foreground-faint">Order {orderLabel}</p>
            <h1 className="mt-3 text-headline-lg">Checking your <em>payment</em>…</h1>
            <div className="mx-auto mt-8 h-px w-24 animate-pulse bg-brass" />
          </>
        )}

        {state === 'PAID' && (
          <>
            <div className="mx-auto mt-12 flex h-14 w-14 items-center justify-center rounded-full border border-olive/40 text-olive">
              <Check strokeWidth={1.25} className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="mt-6 text-label-caps text-foreground-faint">Order {orderLabel}</p>
            <h1 className="mt-3 text-headline-lg">Thank you — <em>it's yours</em></h1>
            <p className="mx-auto mt-4 max-w-sm text-[15px] text-foreground-muted">
              We've received your payment{total != null ? ` of ${formatPrice(total)}` : ''}. You'll get a confirmation email shortly, and our team will be in touch about delivery.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4">
              <PrimaryButton onClick={() => (user ? navigate({ to: '/orders/$orderId', params: { orderId: orderRef } }) : navigate({ to: '/' }))}>
                {user ? 'View your order' : 'Continue shopping'}
              </PrimaryButton>
            </div>
          </>
        )}

        {(state === 'PENDING' || state === 'FAILED') && (
          <>
            <p className="mt-12 text-label-caps text-foreground-faint">Order {orderLabel}</p>
            <h1 className="mt-3 text-headline-lg">
              {state === 'FAILED' ? <>Payment <em>not completed</em></> : <>Complete your <em>payment</em></>}
            </h1>
            <p className="mx-auto mt-4 max-w-sm text-[15px] text-foreground-muted">
              {state === 'FAILED'
                ? "Your order is saved, but we didn't receive payment for it. You can try again — nothing has been charged."
                : returnedFrom
                  ? 'Pesapal is still confirming your payment. This can take a minute for M-Pesa.'
                  : <>Pay {total != null && <span className="text-foreground">{formatPrice(total)}</span>} securely with Pesapal by M-Pesa or card.</>}
            </p>
            <p className="mx-auto mt-3 max-w-sm text-[13px] text-foreground-faint">
              We hold your items for a short time. Unpaid orders are released after a while so others can buy them.
            </p>

            {actionMessage && (
              <p className="mt-8 border border-border bg-surface px-4 py-3 text-[13px] text-foreground-muted" role="status">{actionMessage}</p>
            )}

            <div className="mt-10 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
              <PrimaryButton onClick={startPayment} disabled={initiatePayment.isPending}>
                {initiatePayment.isPending ? 'Starting…' : state === 'FAILED' ? 'Try payment again' : 'Continue to payment'}
              </PrimaryButton>
              <SecondaryButton onClick={checkAgain} disabled={statusQuery.isFetching}>
                {statusQuery.isFetching ? 'Checking…' : 'I have paid — check again'}
              </SecondaryButton>
              {import.meta.env.DEV && (
                <SecondaryButton onClick={devFinish} disabled={completeDevPayment.isPending}>
                  {completeDevPayment.isPending ? 'Finishing…' : 'Finish dev order'}
                </SecondaryButton>
              )}
            </div>
            <HelpLine />
          </>
        )}

        {state === 'REVIEW' && (
          <>
            <p className="mt-12 text-label-caps text-foreground-faint">Order {orderLabel}</p>
            <h1 className="mt-3 text-headline-lg">We're checking your <em>payment</em></h1>
            <p className="mx-auto mt-4 max-w-sm text-[15px] text-foreground-muted">
              We've received a payment for this order, but it doesn't match the order total, so our team is checking it with Pesapal.
              Please don't pay again — we'll contact you shortly.
            </p>
            <HelpLine />
          </>
        )}

        {state === 'EXPIRED' && (
          <>
            <p className="mt-12 text-label-caps text-foreground-faint">Order {orderLabel}</p>
            <h1 className="mt-3 text-headline-lg">This order has <em>expired</em></h1>
            <p className="mx-auto mt-4 max-w-sm text-[15px] text-foreground-muted">
              {info?.payment_status === 'PAID'
                ? "Your payment arrived after the order expired and the items had sold out. We'll refund you in full — our team will be in touch."
                : "We didn't receive payment in time, so the items went back on sale. If money left your account, contact us and we'll sort it out."}
            </p>
            <div className="mt-10 flex justify-center">
              <PrimaryButton onClick={() => navigate({ to: '/shop' })}>Shop again</PrimaryButton>
            </div>
            <HelpLine />
          </>
        )}

        {state === 'unverified' && (
          <>
            <p className="mt-12 text-label-caps text-foreground-faint">Order {orderLabel}</p>
            <h1 className="mt-3 text-headline-lg">We couldn't confirm this order <em>here</em></h1>
            <p className="mx-auto mt-4 max-w-sm text-[15px] text-foreground-muted">
              If you completed payment, you'll receive a confirmation email shortly.
              {user ? ' You can also check your orders.' : ' Questions? Message us and include your order number.'}
            </p>
            <div className="mt-10 flex flex-col items-center gap-4">
              <PrimaryButton onClick={() => navigate({ to: user ? '/orders' : '/' })}>
                {user ? 'My orders' : 'Continue shopping'}
              </PrimaryButton>
            </div>
            <HelpLine />
          </>
        )}
      </div>
    </div>
  );
}

/** Shown when this browser has an order that was placed but not paid, so it isn't placed twice. */
function ResumePaymentBanner() {
  const [pending] = useState(readPendingPayment);
  const statusQuery = usePaymentStatus(pending?.ref, pending?.token);
  const info = statusQuery.data?.data;
  const status = info?.status;

  useEffect(() => {
    if (!pending) return;
    if (status === 'PAID' || status === 'EXPIRED' || statusQuery.isError) clearPendingPayment(pending.ref);
  }, [pending, status, statusQuery.isError]);

  if (!pending || !info || (status !== 'PENDING' && status !== 'FAILED')) return null;

  return (
    <div className="mb-10 flex flex-wrap items-center justify-between gap-4 border border-brass/40 bg-surface px-5 py-4" role="status">
      <p className="text-[14px] text-foreground-muted">
        You have an unpaid order <span className="text-foreground">{info.order_number ?? pending.orderNumber ?? pending.ref}</span>
        {info.total_amount != null && <> for <span className="text-foreground">{formatPrice(info.total_amount)}</span></>}.
        {' '}Complete it rather than ordering again.
      </p>
      <Link
        to="/checkout"
        search={{ order_id: pending.ref, token: pending.token }}
        className="inline-flex h-10 items-center bg-espresso px-5 text-label-caps text-background transition-colors duration-300 hover:bg-espresso-hover"
      >
        Complete payment
      </Link>
    </div>
  );
}

// ── Checkout form ──────────────────────────────────────────────────────────

function CheckoutForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: cartRes, isLoading: cartLoading } = useCart();
  const clearCart = useClearCart();
  const placeOrder = usePlaceOrder();
  const { data: locationsRes } = useActiveShippingLocations();
  const validateDiscount = useValidateDiscountCode();

  const [form, setForm] = useState<FormState>({
    full_name: user?.full_name ?? '',
    email: user?.email ?? '',
    phone: '',
    address_line1: '',
    address_line2: '',
    city: '',
    county: '',
    notes: '',
  });
  const [shippingLocationId, setShippingLocationId] = useState('');
  const [discountCode, setDiscountCode] = useState('');
  const [discountPreview, setDiscountPreview] = useState<{ code: string; discount_amount: number; message: string; subtotal: number; phone: string } | null>(null);
  const [discountMessage, setDiscountMessage] = useState('');
  const [orderError, setOrderError] = useState('');

  const items = cartRes?.data.items ?? [];
  // Live prices and stock from the server — the same pricing order creation uses.
  const quoteQuery = useCartQuote(items);
  const quote = quoteQuery.data?.data;
  const quoteLines = new Map(quote?.lines.map((line) => [line.variant_id, line]));
  const itemsTotal = quote?.subtotal ?? cartRes?.data.total ?? 0;
  const cartNeedsReview = quote ? !quote.can_checkout : false;

  const locations: ShippingLocationResponse[] = (locationsRes?.data as ShippingLocationResponse[]) ?? [];
  const selectedLocation = locations.find((l) => String(l.id) === shippingLocationId);
  const freeDeliveryThreshold = quote?.free_delivery_threshold ?? 0;
  const discountAmount = discountPreview?.discount_amount ?? 0;
  const subtotalAfterDiscount = Math.max(0, itemsTotal - discountAmount);
  const qualifiesForFreeDelivery = freeDeliveryThreshold > 0 && subtotalAfterDiscount >= freeDeliveryThreshold;
  const deliveryCost = selectedLocation ? (qualifiesForFreeDelivery ? 0 : Number(selectedLocation.price)) : 0;
  const grandTotal = subtotalAfterDiscount + deliveryCost;

  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Auth can resolve after first render — fill name/email then, without overwriting what was typed.
  useEffect(() => {
    if (!user) return;
    setForm((f) => ({
      ...f,
      full_name: f.full_name || user.full_name || '',
      email: f.email || user.email || '',
    }));
  }, [user]);

  // A discount is validated against a subtotal and phone number; if either changes, it must be re-applied.
  useEffect(() => {
    if (!discountPreview) return;
    if (discountPreview.subtotal !== itemsTotal || discountPreview.phone !== form.phone.trim()) {
      setDiscountPreview(null);
      setDiscountMessage('Your bag or phone number changed — please apply the code again.');
    }
  }, [discountPreview, itemsTotal, form.phone]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrderError('');
    if (!shippingLocationId || cartNeedsReview) return;

    const { notes, county, ...addressFields } = form;
    const address = {
      ...addressFields,
      state: county.trim(),
      postal_code: '',
      country: 'Kenya',
      phone: form.phone,
    };
    try {
      const res = await placeOrder.mutateAsync({
        items: items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity })),
        shipping_address: address,
        shipping_location_id: parseInt(shippingLocationId, 10),
        phone: form.phone,
        email: form.email,
        discount_code: discountPreview?.code || undefined,
        notes: notes || undefined,
      });
      const order = res.data;
      if (!order) throw new Error('Your order could not be created. Please try again.');
      const ref = order.public_id ?? String(order.id);
      if (order.access_token) {
        savePendingPayment({ ref, token: order.access_token, orderNumber: order.order_number, total: order.total_amount });
      }
      // The bag is now this order. Emptying it means backing out of Pesapal can't place it twice;
      // the customer resumes payment from the banner instead.
      await clearCart.mutateAsync();

      if (order.payment_redirect_url) {
        window.location.assign(order.payment_redirect_url);
        return;
      }
      navigate({ to: '/checkout', search: { order_id: ref, token: order.access_token } });
    } catch (err: any) {
      // Surface the server's reason (e.g. "Insufficient stock", "code already used") instead of a generic failure.
      setOrderError(err?.message || 'We could not place your order. Please try again.');
      quoteQuery.refetch();
    }
  };

  const handleValidateDiscount = async () => {
    setDiscountMessage('');
    setDiscountPreview(null);
    if (!discountCode.trim()) return;
    if (!form.phone.trim()) {
      setDiscountMessage('Enter your phone number first — codes are limited to one use per phone.');
      return;
    }

    try {
      const res = await validateDiscount.mutateAsync({
        code: discountCode.trim(),
        subtotal: itemsTotal,
        phone: form.phone,
      });
      if (res.data?.valid) {
        setDiscountPreview({
          code: res.data.code,
          discount_amount: res.data.discount_amount,
          message: res.data.message,
          subtotal: itemsTotal,
          phone: form.phone.trim(),
        });
        setDiscountCode(res.data.code);
      } else {
        setDiscountMessage(res.data?.message || 'Discount code is invalid.');
      }
    } catch (err: any) {
      setDiscountMessage(err?.message || 'Discount code is invalid.');
    }
  };

  // ── Empty ────────────────────────────────────────────────────────────────
  if (!cartLoading && items.length === 0) {
    return (
      <div className="max-w-[1440px] mx-auto px-4 pt-40 pb-24 text-center sm:px-8">
        <div className="mx-auto max-w-2xl text-left"><ResumePaymentBanner /></div>
        <p className="text-label-caps text-foreground-faint">Checkout</p>
        <h1 className="mt-4 text-display">Your bag is <em>empty</em></h1>
        <Link
          to="/shop"
          className="mt-9 inline-flex h-[52px] items-center bg-espresso px-8 text-label-caps text-background transition-colors duration-300 hover:bg-espresso-hover"
        >
          Discover the collection
        </Link>
      </div>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────
  const canPlaceOrder = Boolean(shippingLocationId) && !cartNeedsReview && !placeOrder.isPending && !quoteQuery.isLoading;

  return (
    <div className="max-w-[1440px] mx-auto px-4 pt-[104px] pb-24 sm:px-8 lg:px-20 lg:pt-32">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-8">
        <div>
          <Steps current={1} />
          <h1 className="mt-5 text-display">Checkout</h1>
        </div>
        <Link to="/cart" className="text-label-caps underline decoration-[0.5px] underline-offset-[6px] hover:text-brass-text">
          Back to bag
        </Link>
      </header>

      <div className="mt-10"><ResumePaymentBanner /></div>
      <form onSubmit={handleSubmit} className="grid gap-12 lg:grid-cols-12 lg:gap-8">
        <div className="space-y-14 lg:col-span-7">
          <FormSection number={1} title="Contact">
            <div className="grid gap-x-6 gap-y-7 sm:grid-cols-2">
              <Field label="Full name" className="sm:col-span-2">
                <input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} required autoComplete="name" className={inputClass} />
              </Field>
              <Field label="Email" hint="For your order confirmation">
                <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required autoComplete="email" className={inputClass} />
              </Field>
              <Field label="Phone" hint="For delivery and M-Pesa">
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  required
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="0712 345 678"
                  className={inputClass}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection number={2} title="Delivery">
            <fieldset>
              <legend className="text-label-caps">Delivery area</legend>
              {locations.length > MAX_RADIO_LOCATIONS ? (
                <select
                  value={shippingLocationId}
                  onChange={(e) => setShippingLocationId(e.target.value)}
                  required
                  className={`${inputClass} mt-3`}
                >
                  <option value="">Select a delivery area…</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={String(loc.id)}>
                      {loc.name} — {formatPrice(Number(loc.price))}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="mt-3 divide-y divide-border border-y border-border">
                  {locations.map((loc) => {
                    const checked = shippingLocationId === String(loc.id);
                    return (
                      <label key={loc.id} className="flex cursor-pointer items-center justify-between gap-4 py-4">
                        <span className="flex items-center gap-3">
                          <input
                            type="radio"
                            name="shipping_location"
                            value={String(loc.id)}
                            checked={checked}
                            onChange={(e) => setShippingLocationId(e.target.value)}
                            required
                            className="h-4 w-4 accent-[var(--espresso)]"
                          />
                          <span className="text-[15px]">{loc.name}</span>
                        </span>
                        <span className="text-[14px] tabular-nums text-foreground-muted">
                          {qualifiesForFreeDelivery ? (
                            <><span className="mr-2 line-through text-foreground-faint">{formatPrice(Number(loc.price))}</span>Free</>
                          ) : formatPrice(Number(loc.price))}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </fieldset>

            <div className="mt-8 grid gap-x-6 gap-y-7 sm:grid-cols-2">
              <Field label="Street address" className="sm:col-span-2">
                <input value={form.address_line1} onChange={(e) => set('address_line1', e.target.value)} required autoComplete="address-line1" placeholder="Building, street" className={inputClass} />
              </Field>
              <Field label="Apartment, suite (optional)" className="sm:col-span-2">
                <input value={form.address_line2} onChange={(e) => set('address_line2', e.target.value)} autoComplete="address-line2" className={inputClass} />
              </Field>
              <Field label="Town / city">
                <input value={form.city} onChange={(e) => set('city', e.target.value)} required autoComplete="address-level2" placeholder="Nairobi" className={inputClass} />
              </Field>
              <Field label="County">
                <input value={form.county} onChange={(e) => set('county', e.target.value)} required autoComplete="address-level1" placeholder="Nairobi County" className={inputClass} />
              </Field>
              <Field label="Delivery notes (optional)" className="sm:col-span-2">
                <textarea
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  rows={2}
                  placeholder="Gate code, landmark, best time to call…"
                  className={`${inputClass} resize-none`}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection number={3} title="Payment">
            <p className="text-[15px] leading-relaxed text-foreground-muted">
              After placing your order you'll continue to <span className="text-foreground">Pesapal</span> to pay securely by M-Pesa or card.
            </p>
          </FormSection>
        </div>

        {/* Summary */}
        <aside aria-label="Order summary" className="lg:sticky lg:top-[104px] lg:col-span-5 lg:col-start-8 lg:self-start xl:col-span-4 xl:col-start-9">
          <div className="bg-surface p-6 sm:p-8">
            <h2 className="text-headline-md">Your order</h2>

            {cartNeedsReview && (
              <p className="mt-5 flex items-start gap-2 border border-brass/40 px-3 py-2.5 text-[13px] text-brass-text" role="alert">
                <AlertCircle strokeWidth={1.25} className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  Some items in your bag have changed.{' '}
                  <Link to="/cart" className="underline underline-offset-4">Review your bag</Link>
                </span>
              </p>
            )}

            <ul className="mt-6 space-y-4">
              {items.map((item) => {
                const line = quoteLines.get(item.variant_id);
                const image = line?.image_url ?? item.product_image_url;
                const unit = line?.unit_price ?? item.unit_price;
                const options = [line?.color ?? item.variant_color, line?.size ?? item.variant_size].filter(Boolean);
                return (
                  <li key={item.variant_id} className="flex gap-4">
                    <div className="relative w-16 shrink-0">
                      <div className="aspect-[4/5] overflow-hidden bg-background">
                        {image && <img src={image} alt="" className="h-full w-full object-cover" />}
                      </div>
                      <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-espresso px-1 text-[11px] text-background">
                        {item.quantity}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-[17px] leading-snug" style={{ fontFamily: 'var(--font-display)' }}>{line?.product_name ?? item.product_name}</p>
                      {options.length > 0 && <p className="text-[12px] capitalize text-foreground-muted">{options.join(' · ')}</p>}
                    </div>
                    <p className="text-[14px] tabular-nums">{formatPrice(unit * item.quantity)}</p>
                  </li>
                );
              })}
            </ul>

            {/* Discount */}
            <div className="mt-8 border-t border-border pt-6">
              <label htmlFor="discount-code" className="text-label-caps">Discount code</label>
              <div className="mt-2 flex items-end gap-3">
                <input
                  id="discount-code"
                  value={discountCode}
                  onChange={(e) => {
                    setDiscountCode(e.target.value.toUpperCase());
                    setDiscountPreview(null);
                    setDiscountMessage('');
                  }}
                  placeholder="Enter code"
                  className={`${inputClass} flex-1 uppercase`}
                />
                <button
                  type="button"
                  onClick={handleValidateDiscount}
                  disabled={validateDiscount.isPending || !discountCode.trim()}
                  className="h-10 border border-espresso px-5 text-label-caps transition-colors duration-300 hover:bg-background disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {validateDiscount.isPending ? 'Checking…' : 'Apply'}
                </button>
              </div>
              {discountPreview && <p className="mt-2 text-[12px] text-olive">{discountPreview.message}</p>}
              {discountMessage && <p className="mt-2 text-[12px] text-destructive">{discountMessage}</p>}
            </div>

            <dl className="mt-6 space-y-3 border-t border-border pt-6 text-[14px]">
              <div className="flex justify-between gap-6">
                <dt className="text-foreground-muted">Subtotal</dt>
                <dd className="tabular-nums">{formatPrice(itemsTotal)}</dd>
              </div>
              {discountPreview && (
                <div className="flex justify-between gap-6">
                  <dt className="text-foreground-muted">Discount ({discountPreview.code})</dt>
                  <dd className="tabular-nums text-olive">−{formatPrice(discountPreview.discount_amount)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-6">
                <dt className="text-foreground-muted">Delivery</dt>
                <dd className="text-right tabular-nums">
                  {!selectedLocation ? <span className="text-foreground-muted">Select an area</span> : deliveryCost === 0 ? 'Free' : formatPrice(deliveryCost)}
                </dd>
              </div>
            </dl>
            {freeDeliveryThreshold > 0 && !qualifiesForFreeDelivery && (
              <p className="mt-3 text-[12px] text-foreground-muted">
                {formatPrice(Math.max(0, freeDeliveryThreshold - subtotalAfterDiscount))} away from free delivery.
              </p>
            )}

            <div className="mt-6 flex items-baseline justify-between gap-4 border-t border-border pt-6">
              <span className="text-label-caps">Total</span>
              <span className="text-[28px] tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>{formatPrice(grandTotal)}</span>
            </div>

            <button
              type="submit"
              disabled={!canPlaceOrder}
              className="mt-8 h-[52px] w-full bg-espresso text-label-caps text-background transition-colors duration-300
                         hover:bg-espresso-hover disabled:cursor-not-allowed disabled:bg-surface-oat disabled:text-foreground-faint"
            >
              {placeOrder.isPending ? 'Placing order…' : 'Place order & pay'}
            </button>
            {!shippingLocationId && !cartNeedsReview && (
              <p className="mt-3 text-center text-[12px] text-foreground-muted">Choose a delivery area to continue.</p>
            )}
            {orderError && (
              <p className="mt-3 flex items-start gap-2 text-[13px] text-destructive" role="alert">
                <AlertCircle strokeWidth={1.25} className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {orderError}
              </p>
            )}

            <p className="mt-6 flex items-center justify-center gap-2 text-[12px] text-foreground-muted">
              <Lock strokeWidth={1} className="h-3.5 w-3.5 text-brass" aria-hidden="true" />
              Secure payment with Pesapal
            </p>

            <p className="mt-6 text-[12px] leading-6 text-foreground-muted">
              By placing your order you agree to our{' '}
              <Link to="/terms" target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-4">terms of sale</Link>,{' '}
              <Link to="/delivery" target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-4">delivery policy</Link>{' '}
              and{' '}
              <Link to="/returns" target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-4">returns policy</Link>.
            </p>
          </div>
          <HelpLine />
        </aside>
      </form>
    </div>
  );
}

const inputClass =
  'w-full border-0 border-b border-stone bg-transparent px-0 py-2 text-[15px] font-light text-foreground placeholder:text-foreground-faint focus:border-foreground focus:outline-none focus:ring-0 transition-colors duration-200';

function Steps({ current }: { current: 1 | 2 | 3 }) {
  const steps = ['Details', 'Payment', 'Confirmed'];
  return (
    <ol className="flex items-center justify-center gap-3 text-label-caps sm:justify-start" aria-label="Checkout progress">
      <li className="text-foreground-faint"><Link to="/cart" className="hover:text-foreground">Bag</Link></li>
      {steps.map((step, i) => (
        <li key={step} className="flex items-center gap-3">
          <span aria-hidden="true" className="h-px w-6 bg-border" />
          <span className={i + 1 === current ? 'text-foreground' : 'text-foreground-faint'} aria-current={i + 1 === current ? 'step' : undefined}>
            {step}
          </span>
        </li>
      ))}
    </ol>
  );
}

function FormSection({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="flex items-baseline gap-4 border-b border-border pb-4">
        <span className="text-label-caps text-brass-text">0{number}</span>
        <span className="text-headline-md">{title}</span>
      </h2>
      <div className="mt-7">{children}</div>
    </section>
  );
}

function Field({ label, hint, className = '', children }: { label: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-label-caps">{label}</span>
        {hint && <span className="text-[11px] text-foreground-faint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function PrimaryButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="h-[52px] bg-espresso px-8 text-label-caps text-background transition-colors duration-300 hover:bg-espresso-hover disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="h-[52px] border border-espresso px-8 text-label-caps transition-colors duration-300 hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function HelpLine() {
  return (
    <p className="mt-6 text-center text-[12px] text-foreground-muted">
      Need help? WhatsApp us on{' '}
      <a href={SHOP_INFO.whatsappUrl} target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-4">
        {SHOP_INFO.phone}
      </a>
    </p>
  );
}
