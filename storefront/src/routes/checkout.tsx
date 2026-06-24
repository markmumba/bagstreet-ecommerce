import { createFileRoute, useNavigate, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useCart } from '@/hooks/useCart';
import { usePlaceOrder } from '@/hooks/useOrders';
import { useAuth } from '@/context/AuthContext';

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

  const [form, setForm] = useState({
    full_name: user?.full_name ?? '',
    phone: '',
    address_line1: '',
    address_line2: '',
    city: '',
    county: '',
    notes: '',
  });

  const cart = (cartRes?.data as any);
  const items = cart?.items ?? [];
  const total = cart?.total ?? 0;

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { notes, ...address } = form;
    await placeOrder.mutateAsync({
      items: items.map((i: any) => ({ variant_id: i.variant_id, quantity: i.quantity })),
      shipping_address: address,
      notes: notes || undefined,
    });
    navigate({ to: '/orders' });
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

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-3xl font-bold mb-8">Checkout</h1>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Shipping */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Shipping Details</h2>

          {[
            { key: 'full_name', label: 'Full Name', placeholder: 'Jane Doe', required: true },
            { key: 'phone', label: 'Phone Number', placeholder: '+254 700 000 000', required: true },
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
            <div className="border-t border-border pt-3 flex justify-between font-semibold">
              <span>Total</span>
              <span className="text-primary">{formatPrice(total)}</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={placeOrder.isPending}
            className="w-full bg-primary text-primary-foreground py-3 rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {placeOrder.isPending ? 'Placing Order...' : 'Place Order'}
          </button>

          {placeOrder.isError && (
            <p className="text-xs text-destructive mt-2 text-center">Failed to place order. Please try again.</p>
          )}
        </div>
      </form>
    </div>
  );
}
