import { createFileRoute, useNavigate, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useCart } from '@/hooks/useCart';
import { usePlaceOrder } from '@/hooks/useOrders';
import { useAuth } from '@/context/AuthContext';
import { useActiveShippingLocations } from '@/hooks/useShipping';

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
  const placeOrder = usePlaceOrder();
  const { data: locationsRes } = useActiveShippingLocations();

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
  const [mpesaPending, setMpesaPending] = useState(false);

  const cart = (cartRes?.data as any);
  const items = cart?.items ?? [];
  const itemsTotal = cart?.total ?? 0;

  const locations = (locationsRes?.data as any[]) ?? [];
  const selectedLocation = locations.find((l: any) => String(l.id) === shippingLocationId);
  const deliveryCost = selectedLocation ? selectedLocation.price : 0;
  const grandTotal = itemsTotal + deliveryCost;

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shippingLocationId) return;

    const { notes, ...address } = form;
    try {
      await placeOrder.mutateAsync({
        items: items.map((i: any) => ({ variant_id: i.variant_id, quantity: i.quantity })),
        shipping_address: address,
        shipping_location_id: parseInt(shippingLocationId, 10),
        phone: form.phone,
        notes: notes || undefined,
      });
      setMpesaPending(true);
      // After 30s navigate to orders with pending banner
      setTimeout(() => {
        navigate({ to: '/orders', search: { payment: 'pending' } as any });
      }, 30000);
    } catch {
      // error shown below
    }
  };

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <h2 className="text-2xl font-semibold mb-4">Sign in to checkout</h2>
        <Link to="/login" className="inline-block bg-primary text-primary-foreground px-6 py-2.5 rounded-md text-sm font-medium">Sign in</Link>
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

  if (mpesaPending) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-4">
        <div className="text-5xl">📱</div>
        <h2 className="text-2xl font-semibold">Check your phone</h2>
        <p className="text-muted-foreground text-sm">
          An M-Pesa prompt has been sent to <strong>{form.phone}</strong> for{' '}
          <strong>{formatPrice(grandTotal)}</strong>. Enter your M-Pesa PIN to complete payment.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Redirecting to your orders in 30 seconds&hellip;
        </p>
        <button
          onClick={() => navigate({ to: '/orders', search: { payment: 'pending' } as any })}
          className="mt-4 inline-block text-sm underline text-primary cursor-pointer"
        >
          Go to My Orders now
        </button>
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

            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Delivery</span>
              <span>{shippingLocationId ? formatPrice(deliveryCost) : '—'}</span>
            </div>

            <div className="border-t border-border pt-3 flex justify-between font-semibold">
              <span>Total</span>
              <span className="text-primary">{formatPrice(grandTotal)}</span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground mb-4 text-center">
            You will receive an M-Pesa prompt on your phone to complete payment.
          </p>

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
