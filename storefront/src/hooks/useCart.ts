import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
