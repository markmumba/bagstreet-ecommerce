import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { AlertCircle, Lock, X } from 'lucide-react';
import type { CartQuoteLine, ProductResponse } from 'shared';
import {
  useCart,
  useCartQuote,
  useReconcileCart,
  useRemoveCartItem,
  useUpdateCartItem,
  type StorefrontCartItem,
} from '@/hooks/useCart';
import { useStorefrontHome } from '@/hooks/useStorefrontHome';
import { useSeo } from '@/hooks/useSeo';
import { ProductRail } from '@/components/home/ProductRail';
import { formatPrice } from '@/lib/format';

export const Route = createFileRoute('/cart')({
  component: CartPage,
});

function CartPage() {
  const navigate = useNavigate();
  useSeo({
    title: 'Your Bag',
    description: 'Review your Bagstreet bag and continue to secure checkout.',
    canonicalPath: '/cart',
  });

  const { data: cartRes, isLoading } = useCart();
  const items = cartRes?.data.items ?? [];
  const quoteQuery = useCartQuote(items);
  const quote = quoteQuery.data?.data;
  const { changedPrices, dismissPriceNotice } = useReconcileCart(quote);
  const updateItem = useUpdateCartItem();
  const removeItem = useRemoveCartItem();

  if (isLoading) return <CartSkeleton />;
  if (items.length === 0) return <EmptyBag />;

  const lines = new Map(quote?.lines.map((line) => [line.variant_id, line]));
  // If the quote can't be fetched, fall back to saved prices — the server re-prices at checkout anyway.
  const quoteFailed = quoteQuery.isError && !quote;
  const subtotal = quote?.subtotal ?? cartRes?.data.total ?? 0;
  // Header matches the navbar badge (what's in the bag); the summary counts what can be bought.
  const bagCount = cartRes?.data.item_count ?? 0;
  const itemCount = quote?.item_count ?? bagCount;
  const problemLines = quote?.lines.filter((line) => line.status !== 'ok') ?? [];
  const canCheckout = quoteFailed || (quote?.can_checkout ?? false);
  const threshold = quote?.free_delivery_threshold ?? 0;
  const toFreeDelivery = quote?.amount_to_free_delivery ?? 0;

  const fixAll = () => {
    for (const line of problemLines) {
      if (line.status === 'insufficient_stock') {
        updateItem.mutate({ variantId: line.variant_id, quantity: line.purchasable_quantity });
      } else {
        removeItem.mutate(line.variant_id);
      }
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 pt-[104px] pb-24 sm:px-8 lg:px-20 lg:pt-32">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-8">
        <div>
          <p className="text-label-caps text-foreground-faint">Shopping bag</p>
          <h1 className="mt-3 text-display">
            Your bag <span className="text-foreground-faint">({bagCount})</span>
          </h1>
        </div>
        <Link
          to="/shop"
          className="text-label-caps underline decoration-[0.5px] underline-offset-[6px] hover:text-brass-text"
        >
          Continue shopping
        </Link>
      </header>

      <div className="mt-10 grid gap-12 lg:grid-cols-12 lg:gap-8">
        <section aria-label="Items in your bag" className="lg:col-span-7 xl:col-span-7">
          {changedPrices.length > 0 && (
            <Notice onDismiss={dismissPriceNotice}>
              {changedPrices.length === 1
                ? `The price of ${changedPrices[0]} has changed since you added it.`
                : `Prices have changed for ${changedPrices.length} items since you added them.`}{' '}
              Your bag now shows current prices.
            </Notice>
          )}
          {problemLines.length > 0 && (
            <Notice tone="warning">
              {problemLines.length === 1 ? 'One item needs' : `${problemLines.length} items need`} your attention before checkout.{' '}
              <button type="button" onClick={fixAll} className="underline underline-offset-4 hover:text-foreground">
                Fix for me
              </button>
            </Notice>
          )}
          {quoteFailed && (
            <Notice tone="warning">
              We couldn't confirm current prices and stock right now. Final prices are confirmed at checkout.
            </Notice>
          )}

          <ul className="divide-y divide-border border-b border-border">
            {items.map((item) => (
              <CartLine
                key={item.variant_id}
                item={item}
                line={lines.get(item.variant_id)}
                onQuantity={(quantity) => updateItem.mutate({ variantId: item.variant_id, quantity })}
                onRemove={() => removeItem.mutate(item.variant_id)}
              />
            ))}
          </ul>
        </section>

        <aside aria-label="Order summary" className="lg:sticky lg:top-[104px] lg:col-span-5 lg:col-start-8 lg:self-start xl:col-span-4 xl:col-start-9">
          <div className="bg-surface p-6 sm:p-8">
            <h2 className="text-headline-md">Summary</h2>

            {threshold > 0 && (
              <div className="mt-6">
                <p className="text-[13px] text-foreground-muted">
                  {toFreeDelivery > 0 ? (
                    <>Spend <span className="text-foreground">{formatPrice(toFreeDelivery)}</span> more for free delivery</>
                  ) : (
                    <span className="text-olive">You've unlocked free delivery</span>
                  )}
                </p>
                <div
                  className="mt-3 h-px bg-border"
                  role="progressbar"
                  aria-label="Progress to free delivery"
                  aria-valuemin={0}
                  aria-valuemax={threshold}
                  aria-valuenow={Math.min(subtotal, threshold)}
                >
                  <div
                    className="h-px bg-brass transition-[width] duration-500"
                    style={{ width: `${Math.min(100, (subtotal / threshold) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            <dl className="mt-8 space-y-4 text-[14px]">
              <div className="flex justify-between gap-6">
                <dt className="text-foreground-muted">Subtotal ({itemCount} {itemCount === 1 ? 'item' : 'items'})</dt>
                <dd className="shrink-0 tabular-nums">{formatPrice(subtotal)}</dd>
              </div>
              <div className="flex justify-between gap-6">
                <dt className="text-foreground-muted">Delivery</dt>
                <dd className="text-right text-foreground-muted">
                  {threshold > 0 && toFreeDelivery === 0 ? 'Free' : 'Calculated at checkout'}
                </dd>
              </div>
              <div className="flex justify-between gap-6">
                <dt className="text-foreground-muted">Discount code</dt>
                <dd className="text-right text-foreground-muted">Add at checkout</dd>
              </div>
            </dl>

            <div className="mt-6 flex items-baseline justify-between gap-4 border-t border-border pt-6">
              <span className="text-label-caps whitespace-nowrap">Estimated total</span>
              <span className="text-[26px] tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>
                {formatPrice(subtotal)}
              </span>
            </div>

            <button
              type="button"
              onClick={() => navigate({ to: '/checkout' })}
              disabled={!canCheckout || quoteQuery.isFetching && !quote}
              className="mt-8 h-[52px] w-full bg-espresso text-label-caps text-background transition-colors duration-300
                         hover:bg-espresso-hover disabled:cursor-not-allowed disabled:bg-surface-oat disabled:text-foreground-faint"
            >
              Checkout
            </button>
            {!canCheckout && problemLines.length > 0 && (
              <p className="mt-3 text-center text-[13px] text-foreground-muted">Resolve the items marked above to continue.</p>
            )}

            <p className="mt-6 flex items-center justify-center gap-2 text-[12px] text-foreground-muted">
              <Lock strokeWidth={1} className="h-3.5 w-3.5 text-brass" aria-hidden="true" />
              Secure checkout with PesaPal
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

const STATUS_MESSAGE: Record<Exclude<CartQuoteLine['status'], 'ok'>, (line: CartQuoteLine) => string> = {
  insufficient_stock: (line) => `Only ${line.purchasable_quantity} left in stock`,
  out_of_stock: () => 'Sold out',
  unavailable: () => 'No longer available',
};

function CartLine({
  item,
  line,
  onQuantity,
  onRemove,
}: {
  item: StorefrontCartItem;
  line: CartQuoteLine | undefined;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  // Prefer live data from the quote; fall back to what was saved when the item was added.
  const name = line?.product_name ?? item.product_name;
  const image = line?.image_url ?? item.product_image_url;
  const unitPrice = line?.unit_price ?? item.unit_price;
  const status = line?.status ?? 'ok';
  const purchasable = status === 'ok' || status === 'insufficient_stock';
  const atStockLimit = line != null && item.quantity >= line.stock;
  const options = [line?.color ?? item.variant_color, line?.size ?? item.variant_size].filter(Boolean);
  const productLink = line?.product_slug ?? item.product_id;

  return (
    <li className="grid grid-cols-[6rem_1fr] gap-5 py-6 sm:grid-cols-[7.5rem_1fr]">
      <Link to="/products/$productId" params={{ productId: productLink }} className="block">
        <div className={`aspect-[4/5] overflow-hidden bg-surface ${purchasable ? '' : 'opacity-50'}`}>
          {image && <img src={image} alt={name} loading="lazy" decoding="async" className="h-full w-full object-cover" />}
        </div>
      </Link>

      <div className="flex min-w-0 flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Link
              to="/products/$productId"
              params={{ productId: productLink }}
              className="block text-[19px] leading-snug hover:text-brass-text sm:text-[21px]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {name}
            </Link>
            {options.length > 0 && (
              <p className="mt-1 text-[13px] capitalize text-foreground-muted">{options.join(' · ')}</p>
            )}
            <p className="mt-1 text-[13px] text-foreground-muted">
              {line?.compare_at_price != null && (
                <span className="mr-2 text-foreground-faint line-through">{formatPrice(line.compare_at_price)}</span>
              )}
              {formatPrice(unitPrice)}
            </p>
          </div>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${name}`}
            className="-mr-1 p-1 text-foreground-faint transition-colors hover:text-foreground"
          >
            <X strokeWidth={1.25} className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {status !== 'ok' && (
          <p className={`mt-3 flex items-center gap-2 text-[13px] ${status === 'insufficient_stock' ? 'text-brass-text' : 'text-destructive'}`}>
            <AlertCircle strokeWidth={1.25} className="h-4 w-4 shrink-0" aria-hidden="true" />
            {STATUS_MESSAGE[status](line!)}
            {status === 'insufficient_stock' ? (
              <button type="button" onClick={() => onQuantity(line!.purchasable_quantity)} className="underline underline-offset-4">
                Update to {line!.purchasable_quantity}
              </button>
            ) : (
              <button type="button" onClick={onRemove} className="underline underline-offset-4">Remove</button>
            )}
          </p>
        )}

        <div className="mt-auto flex items-end justify-between pt-4">
          {purchasable ? (
            <div className="flex h-10 items-center border border-border-subtle">
              <button
                type="button"
                onClick={() => (item.quantity <= 1 ? onRemove() : onQuantity(item.quantity - 1))}
                aria-label={item.quantity <= 1 ? `Remove ${name}` : 'Decrease quantity'}
                className="h-full px-3 text-foreground-muted transition-colors hover:text-foreground"
              >−</button>
              <span className="w-7 text-center text-sm tabular-nums" aria-live="polite">{item.quantity}</span>
              <button
                type="button"
                onClick={() => onQuantity(item.quantity + 1)}
                disabled={atStockLimit}
                aria-label="Increase quantity"
                title={atStockLimit ? 'No more in stock' : undefined}
                className="h-full px-3 text-foreground-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
              >+</button>
            </div>
          ) : (
            <span />
          )}
          <p className="text-[15px] tabular-nums">
            {formatPrice(line ? line.line_total : item.unit_price * item.quantity)}
          </p>
        </div>
      </div>
    </li>
  );
}

function Notice({ children, tone = 'info', onDismiss }: { children: React.ReactNode; tone?: 'info' | 'warning'; onDismiss?: () => void }) {
  return (
    <div
      role="status"
      className={`mb-6 flex items-start justify-between gap-4 border px-4 py-3 text-[13px] ${
        tone === 'warning' ? 'border-brass/40 bg-surface text-brass-text' : 'border-border bg-surface text-foreground-muted'
      }`}
    >
      <p>{children}</p>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 hover:text-foreground">
          <X strokeWidth={1.25} className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function EmptyBag() {
  const { data, isLoading } = useStorefrontHome({ limit: 48 });
  const featured = (data?.data?.featured_products as ProductResponse[]) ?? [];

  return (
    <>
      <div className="max-w-[1440px] mx-auto px-4 pt-40 pb-12 text-center sm:px-8 lg:px-20">
        <p className="text-label-caps text-foreground-faint">Shopping bag</p>
        <h1 className="mt-4 text-display">Your bag is <em>empty</em></h1>
        <p className="mx-auto mt-5 max-w-sm text-[15px] text-foreground-muted">
          Pieces you add will wait here for you, even if you close the page.
        </p>
        <Link
          to="/shop"
          className="mt-9 inline-flex h-[52px] items-center bg-espresso px-8 text-label-caps text-background transition-colors duration-300 hover:bg-espresso-hover"
        >
          Discover the collection
        </Link>
      </div>
      <div className="border-t border-border-subtle">
        <ProductRail eyebrow="The Edit" title="Featured pieces" products={featured} isLoading={isLoading} />
      </div>
    </>
  );
}

function CartSkeleton() {
  return (
    <div className="max-w-[1440px] mx-auto px-4 pt-32 pb-24 sm:px-8 lg:px-20" aria-hidden="true">
      <div className="h-14 w-64 animate-pulse bg-surface" />
      <div className="mt-10 grid gap-12 lg:grid-cols-12 lg:gap-8">
        <div className="space-y-6 lg:col-span-7">
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-5">
              <div className="aspect-[4/5] w-28 animate-pulse bg-surface" />
              <div className="flex-1 space-y-3 pt-2">
                <div className="h-5 w-1/2 animate-pulse bg-surface" />
                <div className="h-3 w-1/4 animate-pulse bg-surface" />
              </div>
            </div>
          ))}
        </div>
        <div className="h-80 animate-pulse bg-surface lg:col-span-4 lg:col-start-9" />
      </div>
    </div>
  );
}
