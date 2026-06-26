import { createFileRoute, useNavigate, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useCart, useClearCart } from '@/hooks/useCart';
import { useConfirmMpesaPayment, usePlaceOrder, useResendMpesaPrompt } from '@/hooks/useOrders';
import { useAuth } from '@/context/AuthContext';
import { useActiveShippingLocations } from '@/hooks/useShipping';
import { useFreeDeliveryThreshold, useValidateDiscountCode } from '@/hooks/usePromotions';
import { PAYMENT_STATUS } from 'shared';

export const Route = createFileRoute('/checkout')({
  component: CheckoutPage,
});

function formatPrice(price: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(price);
}

function CheckoutPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: cartRes } = useCart();
  const clearCart = useClearCart();
  const placeOrder = usePlaceOrder();
  const resendPrompt = useResendMpesaPrompt();
  const confirmPayment = useConfirmMpesaPayment();
  const { data: locationsRes } = useActiveShippingLocations();
  const { data: thresholdRes } = useFreeDeliveryThreshold();
  const validateDiscount = useValidateDiscountCode();

  const [form, setForm] = useState({
    full_name: user?.full_name ?? '',
    phone: '',
    address_line1: '',
    address_line2: '',
    city: '',
    county: '',
    notes: '',
  });
  const [shippingLocationId, setShippingLocationId] = useState('');
  const [paymentStep, setPaymentStep] = useState<'form' | 'prompt' | 'fallback' | 'paid'>('form');
  const [pendingOrder, setPendingOrder] = useState<{ id: number; total: number } | null>(null);
  const [paymentMessage, setPaymentMessage] = useState('');
  const [discountCode, setDiscountCode] = useState('');
  const [discountPreview, setDiscountPreview] = useState<{ code: string; discount_amount: number; message: string } | null>(null);
  const [discountMessage, setDiscountMessage] = useState('');

  const cart = (cartRes?.data as any);
  const items = cart?.items ?? [];
  const itemsTotal = cart?.total ?? 0;

  const locations = (locationsRes?.data as any[]) ?? [];
  const selectedLocation = locations.find((l: any) => String(l.id) === shippingLocationId);
  const freeDeliveryThreshold = thresholdRes?.data?.threshold ?? 0;
  const discountAmount = discountPreview?.discount_amount ?? 0;
  const subtotalAfterDiscount = Math.max(0, itemsTotal - discountAmount);
  const qualifiesForFreeDelivery = freeDeliveryThreshold > 0 && subtotalAfterDiscount >= freeDeliveryThreshold;
  const deliveryCost = selectedLocation ? (qualifiesForFreeDelivery ? 0 : selectedLocation.price) : 0;
  const grandTotal = subtotalAfterDiscount + deliveryCost;
  const tillNumber = import.meta.env.VITE_MPESA_TILL_NUMBER || 'Configure till number';

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shippingLocationId) return;

    const { notes, ...address } = form;
    try {
      const res = await placeOrder.mutateAsync({
        items: items.map((i: any) => ({ variant_id: i.variant_id, quantity: i.quantity })),
        shipping_address: address,
        shipping_location_id: parseInt(shippingLocationId, 10),
        phone: form.phone,
        discount_code: discountCode.trim() || undefined,
        notes: notes || undefined,
      });
      const order = res.data;
      setPendingOrder(order ? { id: Number(order.id), total: order.total_amount } : null);
      clearCart.mutate();
      setPaymentStep('prompt');
      setPaymentMessage('');
      setTimeout(() => {
        setPaymentStep((step) => (step === 'prompt' ? 'fallback' : step));
      }, 30000);
    } catch {
      // error shown below
    }
  };

  const handleValidateDiscount = async () => {
    setDiscountMessage('');
    setDiscountPreview(null);
    if (!discountCode.trim()) return;
    if (!form.phone.trim()) {
      setDiscountMessage('Enter your M-Pesa phone number before applying a code.');
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
        });
        setDiscountCode(res.data.code);
      } else {
        setDiscountMessage(res.data?.message || 'Discount code is invalid.');
      }
    } catch (err: any) {
      setDiscountMessage(err?.message || 'Discount code is invalid.');
    }
  };

  const handleResendPrompt = async () => {
    if (!pendingOrder) return;
    setPaymentMessage('');
    try {
      await resendPrompt.mutateAsync({ order_id: pendingOrder.id, phone: form.phone });
      setPaymentStep('prompt');
      setPaymentMessage('A new M-Pesa prompt has been sent to your phone.');
      setTimeout(() => {
        setPaymentStep((step) => (step === 'prompt' ? 'fallback' : step));
      }, 30000);
    } catch (err: any) {
      setPaymentMessage(err?.message || 'We could not resend the prompt. Please try again shortly.');
    }
  };

  const handleConfirmPayment = async () => {
    if (!pendingOrder) return;
    setPaymentMessage('');
    try {
      const res = await confirmPayment.mutateAsync({ order_id: pendingOrder.id, phone: form.phone });
      if (res.data?.status === PAYMENT_STATUS.PAID) {
        setPaymentStep('paid');
        return;
      }
      setPaymentMessage(res.message || 'Payment has not been received yet. Please try again in a moment.');
    } catch (err: any) {
      setPaymentMessage(err?.message || 'We could not confirm payment yet. Please try again shortly.');
    }
  };

  if (paymentStep === 'prompt' || paymentStep === 'fallback' || paymentStep === 'paid') {
    return (
      <div className="max-w-xl mx-auto px-4 py-20">
        <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          {paymentStep === 'paid' ? (
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Payment confirmed</p>
              <h2 className="text-2xl font-semibold">Your order is confirmed</h2>
              <p className="text-sm text-muted-foreground">
                We have received your M-Pesa payment for order #{pendingOrder?.id}.
              </p>
              <button
                onClick={() => navigate({ to: user ? '/orders' : '/' })}
                className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                {user ? 'View My Orders' : 'Continue Shopping'}
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Order #{pendingOrder?.id}
                </p>
                <h2 className="text-2xl font-semibold">
                  {paymentStep === 'prompt' ? 'Check your phone' : 'Complete your payment'}
                </h2>
                <p className="text-sm text-muted-foreground">
                  We sent an M-Pesa prompt to <strong>{form.phone}</strong> for{' '}
                  <strong>{formatPrice(pendingOrder?.total ?? grandTotal)}</strong>.
                </p>
              </div>

              {paymentStep === 'fallback' && (
                <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-left">
                  <p className="text-sm font-semibold">Manual M-Pesa payment</p>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Till number</dt>
                      <dd className="font-semibold">{tillNumber}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Amount</dt>
                      <dd className="font-semibold">{formatPrice(pendingOrder?.total ?? grandTotal)}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-muted-foreground">Reference</dt>
                      <dd className="font-semibold">Order #{pendingOrder?.id} or {form.phone}</dd>
                    </div>
                  </dl>
                </div>
              )}

              {paymentMessage && (
                <p className="rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {paymentMessage}
                </p>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                <button
                  onClick={handleResendPrompt}
                  disabled={resendPrompt.isPending}
                  className="inline-flex h-10 items-center justify-center rounded-md border border-border px-5 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  {resendPrompt.isPending ? 'Sending...' : 'Resend M-Pesa Prompt'}
                </button>
                <button
                  onClick={handleConfirmPayment}
                  disabled={confirmPayment.isPending}
                  className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {confirmPayment.isPending ? 'Checking...' : "I've Paid - Confirm"}
                </button>
              </div>

              {user && (
                <button
                  onClick={() => navigate({ to: '/orders', search: { payment: 'pending' } as any })}
                  className="text-sm text-primary underline underline-offset-4"
                >
                  Go to My Orders
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <h2 className="text-2xl font-semibold mb-4">Your cart is empty</h2>
        <Link to="/" className="inline-block bg-primary text-primary-foreground px-6 py-2.5 rounded-md text-sm font-medium">Shop now</Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-3xl font-bold mb-8">Checkout</h1>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Shipping */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Shipping Details</h2>

          {[
            { key: 'full_name', label: 'Full Name', placeholder: 'Jane Doe', required: true },
            { key: 'phone', label: 'M-Pesa Phone Number', placeholder: '0712 345 678', required: true },
            { key: 'address_line1', label: 'Address', placeholder: '123 Kenyatta Ave', required: true },
            { key: 'address_line2', label: 'Apartment / Suite (optional)', placeholder: 'Apt 4B', required: false },
            { key: 'city', label: 'City', placeholder: 'Nairobi', required: true },
            { key: 'county', label: 'County', placeholder: 'Nairobi County', required: true },
          ].map(({ key, label, placeholder, required }) => (
            <div key={key}>
              <label className="block text-sm font-medium mb-1">
                {label} {required && <span className="text-destructive">*</span>}
              </label>
              <input
                type="text"
                value={(form as any)[key]}
                onChange={(e) => set(key, e.target.value)}
                placeholder={placeholder}
                required={required}
                className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          ))}

          {/* Delivery location */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Delivery Location <span className="text-destructive">*</span>
            </label>
            <select
              value={shippingLocationId}
              onChange={(e) => setShippingLocationId(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select a delivery area…</option>
              {locations.map((loc: any) => (
                <option key={loc.id} value={String(loc.id)}>
                  {loc.name} — {formatPrice(loc.price)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Order Notes (optional)</label>
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={3}
              placeholder="Any special instructions..."
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>
        </div>

        {/* Order summary */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Order Summary</h2>
          <div className="border border-border rounded-lg bg-card p-4 space-y-3 mb-6">
            {items.map((item: any) => (
              <div key={item.variant_id} className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {item.product_name}
                  {item.variant_size && ` (${item.variant_size})`}
                  {item.variant_color && ` — ${item.variant_color}`}
                  {' '}× {item.quantity}
                </span>
                <span className="font-medium">{formatPrice(item.subtotal)}</span>
              </div>
            ))}

            <div className="flex justify-between text-sm text-muted-foreground border-t border-border pt-2">
              <span>Subtotal</span>
              <span>{formatPrice(itemsTotal)}</span>
            </div>

            {discountPreview && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Discount ({discountPreview.code})</span>
                <span>-{formatPrice(discountPreview.discount_amount)}</span>
              </div>
            )}

            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Delivery</span>
              <span>{shippingLocationId ? (deliveryCost === 0 ? 'FREE' : formatPrice(deliveryCost)) : '—'}</span>
            </div>

            <div className="border-t border-border pt-3 flex justify-between font-semibold">
              <span>Total</span>
              <span className="text-primary">{formatPrice(grandTotal)}</span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground mb-4 text-center">
            You will receive an M-Pesa prompt on your phone to complete payment.
          </p>

          <div className="mb-4 rounded-lg border border-border bg-muted/20 p-3">
            <label className="block text-xs font-medium mb-2">Promo code</label>
            <div className="flex gap-2">
              <input
                value={discountCode}
                onChange={(e) => {
                  setDiscountCode(e.target.value.toUpperCase());
                  setDiscountPreview(null);
                  setDiscountMessage('');
                }}
                placeholder="INSTA10"
                className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={handleValidateDiscount}
                disabled={validateDiscount.isPending || !discountCode.trim()}
                className="h-10 rounded-md border border-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                {validateDiscount.isPending ? 'Checking...' : 'Apply'}
              </button>
            </div>
            {discountPreview && <p className="mt-2 text-xs text-primary">{discountPreview.message}</p>}
            {discountMessage && <p className="mt-2 text-xs text-destructive">{discountMessage}</p>}
            {freeDeliveryThreshold > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {qualifiesForFreeDelivery
                  ? 'Free delivery applied.'
                  : `${formatPrice(Math.max(0, freeDeliveryThreshold - subtotalAfterDiscount))} away from free delivery.`}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={placeOrder.isPending || !shippingLocationId}
            className="w-full bg-primary text-primary-foreground py-3 rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {placeOrder.isPending ? 'Placing Order...' : 'Place Order & Pay via M-Pesa'}
          </button>

          {placeOrder.isError && (
            <p className="text-xs text-destructive mt-2 text-center">
              Failed to place order. Please try again.
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
