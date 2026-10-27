import type { BaseType } from "./baseType";
import type { ProductVariantResponse } from "./variant";

export interface Product extends BaseType {
    category_id: string,
    sku: string,
    name: string,
    slug: string,
    description: string,
    price: number,
    sale_price?: number,
    sale_ends_at?: string,
    stock: number,
    image_url: string,
    is_active: boolean,
    is_featured: boolean,
}

export interface ProductImage {
    id: string,
    product_id: string,
    url: string,
    alt_text?: string,
    position: number,
    is_primary: boolean,
    created_at: string,
}

export interface ProductRequest {
    category_id: string,
    name: string,
    description?: string,
    price: number,
    stock?: number,
    image_url:string,
    is_active: boolean,
}

export interface ProductUpdateRequest {
    name?: string,
    description?: string,
    price?: number,
    sale_price?: number | null,
    sale_ends_at?: string | null,
    is_active?: boolean,
    is_featured?: boolean,
}

export interface ProductDeleteResponse {
    action: "deleted" | "deactivated",
    product_id: string,
}

export interface ProductResponse {
    /** Approved reviews: average rating (one decimal) and how many. */
    rating_average?: number | null;
    rating_count?: number;
    id: string,
    category_id: string,
    sku: string,
    slug: string,
    name: string,
    description: string,
    price: number,
    sale_price?: number,
    sale_ends_at?: string,
    stock: number,
    total_stock?: number,
    stock_status?: 'out' | 'low' | 'high',
    low_stock_variant_count?: number,
    out_of_stock_variant_count?: number,
    image_url: string,
    images?: ProductImage[],
    is_active: boolean,
    is_featured: boolean,
    created_at: string,
    updated_at: string,
    variants?: ProductVariantResponse[],
}

/** Saved views on the admin products list. `restock`: some size is low or sold out. `hidden`: not on the shop. */
export const PRODUCT_LIST_VIEWS = ['restock', 'sale', 'featured', 'hidden'] as const;
export type ProductListView = typeof PRODUCT_LIST_VIEWS[number];

/** Admin products list order, applied across every page (not just the one on screen). */
export const PRODUCT_LIST_SORTS = ['name_asc', 'name_desc', 'price_asc', 'price_desc', 'stock_asc', 'stock_desc', 'newest', 'oldest'] as const;
export type ProductListSort = typeof PRODUCT_LIST_SORTS[number];

/** How many products each saved view holds, for the current search and category. */
export type ProductViewCounts = Record<'all' | ProductListView, number>;
