import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Trash2 } from 'lucide-react';
import { useCart, useUpdateCartItem, useRemoveCartItem } from '@/hooks/useCart';
import { useFreeDeliveryThreshold } from '@/hooks/usePromotions';
import { useSeo } from '@/hooks/useSeo';

export const Route = createFileRoute('/cart')({
  component: CartPage,
});

function formatPrice(price: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(price);
}

function CartPage() {
  const navigate = useNavigate();
  useSeo({
    title: 'Shopping Cart',
    description: 'Review your Bagstreet cart and continue to secure checkout.',
    canonicalPath: '/cart',
  });
  const { data: cartRes, isLoading } = useCart();
  const { data: thresholdRes } = useFreeDeliveryThreshold();
  const updateItem = useUpdateCartItem();
  const removeItem = useRemoveCartItem();

  const cart = (cartRes?.data as any);
  const items = cart?.items ?? [];
  const total = cart?.total ?? items.reduce((sum: number, i: any) => sum + i.subtotal, 0);
  const freeDeliveryThreshold = thresholdRes?.data?.threshold ?? 0;
  const amountToFreeDelivery = Math.max(0, freeDeliveryThreshold - total);

  if (isLoading) return <div className="max-w-2xl mx-auto px-4 py-10 text-muted-foreground">Loading cart...</div>;

  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <h2 className="text-2xl font-semibold mb-2">Your cart is empty</h2>
        <p className="text-muted-foreground mb-6">Add some products to get started.</p>
        <Link to="/" className="inline-block bg-primary text-primary-foreground px-6 py-2.5 rounded-md text-sm font-medium hover:opacity-90">
          Continue Shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-28">
      <h1 className="text-3xl font-bold mb-8">Your Cart</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          {items.map((item: any) => (
            <div key={item.variant_id} className="grid grid-cols-[5rem_1fr] gap-4 border border-border bg-card p-4 sm:flex">
              <div className="w-20 h-20 rounded-md overflow-hidden bg-muted shrink-0">
                {item.product_image_url ? (
                  <img
                    src={item.product_image_url}
                    alt={item.product_name}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-muted" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{item.product_name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {[item.variant_size, item.variant_color].filter(Boolean).join(' · ')}
                </p>
                <p className="text-sm font-semibold text-primary mt-1">{formatPrice(item.unit_price)}</p>
              </div>
              <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:ml-auto sm:flex-col sm:items-end sm:gap-2">
                <button
                  onClick={() => removeItem.mutate(item.variant_id)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <div className="flex items-center border border-border rounded text-sm">
                  <button
                    onClick={() => {
                      if (item.quantity <= 1) removeItem.mutate(item.variant_id);
                      else updateItem.mutate({ variantId: item.variant_id, quantity: item.quantity - 1 });
                    }}
                    className="px-2 py-1 hover:bg-muted transition-colors"
                  >−</button>
                  <span className="px-3 py-1 font-medium">{item.quantity}</span>
                  <button
                    onClick={() => updateItem.mutate({ variantId: item.variant_id, quantity: item.quantity + 1 })}
                    className="px-2 py-1 hover:bg-muted transition-colors"
                  >+</button>
                </div>
                <p className="text-sm font-semibold">{formatPrice(item.subtotal)}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="lg:col-span-1">
          <div className="border border-border rounded-lg p-6 bg-card sticky top-24">
            <h2 className="text-lg font-semibold mb-4">Order Summary</h2>
            {freeDeliveryThreshold > 0 && (
              <div className="mb-4 rounded-lg border border-border bg-muted/30 p-3 text-sm">
                {amountToFreeDelivery > 0 ? (
                  <p className="text-muted-foreground">
                    Spend <span className="font-semibold text-foreground">{formatPrice(amountToFreeDelivery)}</span> more for free delivery.
                  </p>
                ) : (
                  <p className="font-medium text-foreground">You qualify for free delivery.</p>
                )}
              </div>
            )}
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Subtotal ({items.length} item{items.length !== 1 ? 's' : ''})</span>
              <span className="font-medium">{formatPrice(total)}</span>
            </div>
            <div className="border-t border-border my-4" />
            <div className="flex justify-between font-semibold mb-6">
              <span>Total</span>
              <span className="text-primary">{formatPrice(total)}</span>
            </div>
            <button
              onClick={() => navigate({ to: '/checkout' })}
              className="w-full bg-primary text-primary-foreground py-3 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Proceed to Checkout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
