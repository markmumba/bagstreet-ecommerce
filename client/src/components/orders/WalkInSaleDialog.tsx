import { useMemo, useState } from 'react';
import { Loader2, Minus, Plus, Search, ShoppingBag, Trash2, Wallet } from 'lucide-react';
import type { OrderResponse, WalkInCatalogItemResponse, WalkInPaymentMethod } from 'shared';
import { WALK_IN_PAYMENT_METHOD } from 'shared';
import { useCreateWalkInSale, useWalkInCatalog } from '@/hooks/useOrders';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type CartItem = WalkInCatalogItemResponse & { quantity: number };

interface WalkInSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (order: OrderResponse) => void;
}

const paymentLabels: Record<WalkInPaymentMethod, string> = {
  [WALK_IN_PAYMENT_METHOD.CASH]: 'Cash',
  [WALK_IN_PAYMENT_METHOD.CARD]: 'Card',
  [WALK_IN_PAYMENT_METHOD.BANK_TRANSFER]: 'Bank transfer',
  [WALK_IN_PAYMENT_METHOD.PESAPAL]: 'Pesapal',
  [WALK_IN_PAYMENT_METHOD.OTHER]: 'Other',
};

function formatMoney(value: number) {
  return `KES ${value.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function variantLabel(item: Pick<WalkInCatalogItemResponse, 'variant_size' | 'variant_color'>) {
  return [item.variant_size, item.variant_color].filter(Boolean).join(' / ') || 'Default variant';
}

export function WalkInSaleDialog({ open, onOpenChange, onCreated }: WalkInSaleDialogProps) {
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<WalkInPaymentMethod>(WALK_IN_PAYMENT_METHOD.CASH);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const catalogQuery = useWalkInCatalog(search, open);
  const createSale = useCreateWalkInSale();
  const catalog = catalogQuery.data ?? [];
  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0),
    [cart]
  );
  const itemCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  const reset = () => {
    setSearch('');
    setCart([]);
    setPaymentMethod(WALK_IN_PAYMENT_METHOD.CASH);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
    setNotes('');
    setError('');
  };

  const close = (nextOpen: boolean) => {
    if (!nextOpen && !createSale.isPending) reset();
    onOpenChange(nextOpen);
  };

  const addItem = (item: WalkInCatalogItemResponse) => {
    setError('');
    setCart((current) => {
      const existing = current.find((cartItem) => cartItem.variant_id === item.variant_id);
      if (!existing) return [...current, { ...item, quantity: 1 }];
      if (existing.quantity >= item.stock) return current;
      return current.map((cartItem) =>
        cartItem.variant_id === item.variant_id
          ? { ...cartItem, quantity: cartItem.quantity + 1 }
          : cartItem
      );
    });
  };

  const updateQuantity = (variantId: string, quantity: number) => {
    setCart((current) =>
      current
        .map((item) =>
          item.variant_id === variantId
            ? { ...item, quantity: Math.min(item.stock, Math.max(1, quantity)) }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const removeItem = (variantId: string) => {
    setCart((current) => current.filter((item) => item.variant_id !== variantId));
  };

  const completeSale = async () => {
    setError('');
    if (cart.length === 0) {
      setError('Add at least one item to record a walk-in sale.');
      return;
    }

    try {
      const res = await createSale.mutateAsync({
        items: cart.map((item) => ({
          variant_id: Number(item.variant_id),
          quantity: item.quantity,
        })),
        payment_method: paymentMethod,
        customer_name: customerName.trim() || undefined,
        customer_phone: customerPhone.trim() || undefined,
        customer_email: customerEmail.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      if (res.data) onCreated?.(res.data);
      reset();
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to record walk-in sale');
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92vh] overflow-hidden p-0 sm:max-w-[980px]">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <ShoppingBag className="h-5 w-5" strokeWidth={1.8} />
            New walk-in sale
          </DialogTitle>
          <DialogDescription>
            Record items bought at the shop counter. Stock and revenue are updated immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[calc(92vh-150px)] overflow-hidden lg:grid-cols-[1fr_380px]">
          <section className="min-h-0 border-b p-6 lg:border-b-0 lg:border-r">
            <Label htmlFor="walk-in-search">Find item</Label>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.8} />
              <Input
                id="walk-in-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by product name or SKU..."
                className="pl-9"
              />
            </div>

            <div className="mt-4 max-h-[52vh] space-y-2 overflow-y-auto pr-1">
              {catalogQuery.isLoading && (
                <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading inventory
                </div>
              )}

              {!catalogQuery.isLoading && catalog.length === 0 && (
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <p className="text-sm font-medium">No available variants found</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Try another product name or SKU.
                  </p>
                </div>
              )}

              {catalog.map((item) => {
                const cartItem = cart.find((entry) => entry.variant_id === item.variant_id);
                const quantityInCart = cartItem?.quantity ?? 0;
                const isMaxed = quantityInCart >= item.stock;

                return (
                  <div
                    key={item.variant_id}
                    className={cn(
                      'flex gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/40',
                      isMaxed && 'border-[var(--color-warning-border)]'
                    )}
                  >
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md border bg-muted">
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.product_name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{item.product_name}</p>
                          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                            {item.variant_sku}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold tabular-nums">{formatMoney(item.unit_price)}</p>
                          {item.is_on_sale && <Badge variant="warning">sale</Badge>}
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs text-muted-foreground">{variantLabel(item)}</p>
                          <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                            {item.stock} in stock{quantityInCart > 0 ? ` · ${quantityInCart} in sale` : ''}
                          </p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => addItem(item)} disabled={isMaxed}>
                          <Plus className="mr-1 h-3.5 w-3.5" />
                          Add
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="min-h-0 overflow-y-auto p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Sale cart</h3>
                <p className="text-xs text-muted-foreground">
                  {itemCount} item{itemCount !== 1 ? 's' : ''}
                </p>
              </div>
              <Badge variant={cart.length > 0 ? 'success' : 'neutral'}>{formatMoney(total)}</Badge>
            </div>

            <div className="mt-4 space-y-2">
              {cart.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Add purchased items from the inventory list.
                </div>
              ) : (
                cart.map((item) => (
                  <div key={item.variant_id} className="rounded-lg border bg-card p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.product_name}</p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{variantLabel(item)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item.variant_id)}
                        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                        aria-label={`Remove ${item.product_name}`}
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.8} />
                      </button>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="flex items-center rounded-lg border">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 px-0"
                          onClick={() => updateQuantity(item.variant_id, item.quantity - 1)}
                          disabled={item.quantity <= 1}
                          aria-label={`Decrease ${item.product_name}`}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <Input
                          value={item.quantity}
                          onChange={(event) => updateQuantity(item.variant_id, Number(event.target.value) || 1)}
                          className="h-8 w-12 border-0 px-1 text-center tabular-nums"
                          inputMode="numeric"
                          aria-label={`${item.product_name} quantity`}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 px-0"
                          onClick={() => updateQuantity(item.variant_id, item.quantity + 1)}
                          disabled={item.quantity >= item.stock}
                          aria-label={`Increase ${item.product_name}`}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <p className="text-sm font-semibold tabular-nums">
                        {formatMoney(item.unit_price * item.quantity)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-6 space-y-4 border-t pt-5">
              <div className="space-y-2">
                <Label htmlFor="walk-in-payment">Payment</Label>
                <Select
                  value={paymentMethod}
                  onValueChange={(value) => setPaymentMethod(value as WalkInPaymentMethod)}
                >
                  <SelectTrigger id="walk-in-payment">
                    <Wallet className="mr-2 h-4 w-4" strokeWidth={1.8} />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(WALK_IN_PAYMENT_METHOD).map((method) => (
                      <SelectItem key={method} value={method}>
                        {paymentLabels[method]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="walk-in-customer-name">Customer name</Label>
                  <Input
                    id="walk-in-customer-name"
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="walk-in-phone">Phone</Label>
                  <Input
                    id="walk-in-phone"
                    value={customerPhone}
                    onChange={(event) => setCustomerPhone(event.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="walk-in-email">Email</Label>
                  <Input
                    id="walk-in-email"
                    type="email"
                    value={customerEmail}
                    onChange={(event) => setCustomerEmail(event.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="walk-in-notes">Notes</Label>
                <Textarea
                  id="walk-in-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Optional sale note"
                  rows={3}
                />
              </div>

              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
            </div>
          </section>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={() => close(false)} disabled={createSale.isPending}>
            Cancel
          </Button>
          <Button onClick={completeSale} disabled={cart.length === 0 || createSale.isPending}>
            {createSale.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Complete sale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
