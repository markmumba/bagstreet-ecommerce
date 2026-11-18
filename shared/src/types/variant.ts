export interface ProductVariantResponse {
  id: string;
  product_id: string;
  sku: string;
  size?: string;
  color?: string;
  stock: number;
  low_stock_threshold?: number;
  price_override?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductVariantRequest {
  size?: string;
  color?: string;
  stock: number;
  low_stock_threshold?: number;
  price_override?: number;
  is_active?: boolean;
}

/** Why a variant's stock changed (inventory_movements.reason). Stored: never change the values. */
export const STOCK_MOVEMENT_REASON = {
    ORDER_PLACED: 'ORDER_PLACED',
    ORDER_CANCELLED: 'ORDER_CANCELLED',
    /** A staff count correction. */
    ADMIN_ADJUSTMENT: 'ADMIN_ADJUSTMENT',
    RESTOCK: 'RESTOCK',
} as const;
export type StockMovementReason = typeof STOCK_MOVEMENT_REASON[keyof typeof STOCK_MOVEMENT_REASON];
