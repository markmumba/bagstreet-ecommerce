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
