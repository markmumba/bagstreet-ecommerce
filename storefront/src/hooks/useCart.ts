import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CartQuoteResponse } from 'shared';
import { apiClient } from '@/services/api';

const CART_STORAGE_KEY = 'bagstreet_guest_cart';

export interface StorefrontCartItem {
  id: string;
  variant_id: number;
  product_id: string;
  product_name: string;
  product_image_url: string;
  variant_sku?: string;
  variant_size?: string;
  variant_color?: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
}

export interface StorefrontCart {
  items: StorefrontCartItem[];
  total: number;
  item_count: number;
}

export const cartKeys = { all: ['cart'] as const };

function readCartItems(): StorefrontCartItem[] {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StorefrontCartItem[];
    return parsed.map((item) => ({
      ...item,
      subtotal: item.unit_price * item.quantity,
    }));
  } catch {
    return [];
  }
}

function writeCartItems(items: StorefrontCartItem[]) {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
}

function toCart(items: StorefrontCartItem[]): StorefrontCart {
  return {
    items,
    total: items.reduce((sum, item) => sum + item.subtotal, 0),
    item_count: items.reduce((sum, item) => sum + item.quantity, 0),
  };
}

export function useCart() {
  return useQuery({
    queryKey: cartKeys.all,
    queryFn: () => ({ data: toCart(readCartItems()) }),
    staleTime: 1000 * 30,
  });
}

export function useAddToCart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      variant_id: number;
      product_id: string;
      product_name: string;
      product_image_url?: string;
      variant_sku?: string;
      variant_size?: string;
      variant_color?: string;
      unit_price: number;
      quantity: number;
    }) => {
      const items = readCartItems();
      const existing = items.find((item) => item.variant_id === data.variant_id);

      if (existing) {
        existing.quantity += data.quantity;
        existing.unit_price = data.unit_price;
        existing.subtotal = existing.unit_price * existing.quantity;
      } else {
        items.push({
          id: String(data.variant_id),
          variant_id: data.variant_id,
          product_id: data.product_id,
          product_name: data.product_name,
          product_image_url: data.product_image_url ?? '',
          variant_sku: data.variant_sku,
          variant_size: data.variant_size,
          variant_color: data.variant_color,
          unit_price: data.unit_price,
          quantity: data.quantity,
          subtotal: data.unit_price * data.quantity,
        });
      }

      writeCartItems(items);
      return Promise.resolve({ data: toCart(items) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: cartKeys.all }),
  });
}

export function useUpdateCartItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ variantId, quantity }: { variantId: number; quantity: number }) => {
      const items = readCartItems()
        .map((item) =>
          item.variant_id === variantId
            ? { ...item, quantity, subtotal: item.unit_price * quantity }
            : item
        )
        .filter((item) => item.quantity > 0);
      writeCartItems(items);
      return Promise.resolve({ data: toCart(items) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: cartKeys.all }),
  });
}

export function useRemoveCartItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (variantId: number) => {
      const items = readCartItems().filter((item) => item.variant_id !== variantId);
      writeCartItems(items);
      return Promise.resolve({ data: toCart(items) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: cartKeys.all }),
  });
}

export function useClearCart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => {
      writeCartItems([]);
      return Promise.resolve({ data: toCart([]) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: cartKeys.all }),
  });
}

export function useRestoreCart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) => {
      const response = await apiClient.post<import('shared').CartRecoveryResponse>('/api/cart-recovery/restore', { token });
      const quote = response.data?.quote;
      if (!quote || !quote.item_count) throw new Error('None of these items is currently available.');
      const items: StorefrontCartItem[] = quote.lines.filter(line => line.purchasable_quantity > 0 && line.unit_price !== null).map(line => ({
        id: String(line.variant_id), variant_id: line.variant_id, product_id: line.product_id!,
        product_name: line.product_name!, product_image_url: line.image_url ?? '',
        variant_size: line.size ?? undefined, variant_color: line.color ?? undefined,
        unit_price: line.unit_price!, quantity: line.purchasable_quantity, subtotal: line.line_total,
      }));
      writeCartItems(items);
      return { data: toCart(items) };
    },
    onSuccess: response => {
      qc.setQueryData(cartKeys.all, response);
      qc.invalidateQueries({ queryKey: cartKeys.all });
    },
  });
}

/**
 * Prices and stock-checks the local cart against the server — the same pricing
 * order creation uses. Re-runs when quantities change and when the tab regains focus.
 */
export function useCartQuote(items: StorefrontCartItem[]) {
  const request = items.map((item) => ({ variant_id: item.variant_id, quantity: item.quantity }));
  return useQuery({
    queryKey: [...cartKeys.all, 'quote', request],
    queryFn: () => apiClient.post<CartQuoteResponse>('/api/storefront/cart/quote', { items: request }),
    enabled: items.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 1000 * 15,
    refetchOnWindowFocus: true,
  });
}

/**
 * Writes current prices, names and images from a quote back into the saved cart, so checkout
 * and the cart badge agree with the server. Returns the names of items whose price changed.
 */
export function useReconcileCart(quote: CartQuoteResponse | undefined) {
  const qc = useQueryClient();
  const [changedPrices, setChangedPrices] = useState<string[]>([]);

  useEffect(() => {
    if (!quote) return;
    const lines = new Map(quote.lines.map((line) => [line.variant_id, line]));
    const priceChanges: string[] = [];
    let dirty = false;

    const items = readCartItems().map((item) => {
      const line = lines.get(item.variant_id);
      if (!line || line.unit_price == null) return item;

      const next = {
        ...item,
        unit_price: line.unit_price,
        product_name: line.product_name ?? item.product_name,
        product_image_url: line.image_url ?? item.product_image_url,
        subtotal: line.unit_price * item.quantity,
      };
      if (next.unit_price !== item.unit_price) priceChanges.push(next.product_name);
      if (
        next.unit_price !== item.unit_price
        || next.product_name !== item.product_name
        || next.product_image_url !== item.product_image_url
      ) dirty = true;
      return next;
    });

    if (!dirty) return;
    writeCartItems(items);
    if (priceChanges.length > 0) setChangedPrices((prev) => [...new Set([...prev, ...priceChanges])]);
    // Exact: refresh the cart itself without re-requesting the quote we just applied.
    qc.invalidateQueries({ queryKey: cartKeys.all, exact: true });
  }, [quote, qc]);

  return { changedPrices, dismissPriceNotice: () => setChangedPrices([]) };
}

/** Keeps the cart in step when it's changed in another tab. Mount once at the app root. */
export function useCartStorageSync() {
  const qc = useQueryClient();
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === CART_STORAGE_KEY || event.key === null) {
        qc.invalidateQueries({ queryKey: cartKeys.all });
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [qc]);
}
