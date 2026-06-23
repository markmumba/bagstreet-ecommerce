import type { BaseType } from "./baseType";
import type { ProductVariantResponse } from "./variant";

export interface Product extends BaseType {
    category_id: string,
    sku: string,
    name: string,
    slug: string,
    description: string,
    price: number,
    stock: number,
    image_url: string,
    is_active: boolean,
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
}

export interface ProductResponse {
    id: string,
    category_id: string,
    sku: string,
    name: string,
    description: string,
    price: number,
    stock: number,
    total_stock?: number,
    image_url: string,
    is_active: boolean,
    created_at: string,
    updated_at: string,
    variants?: ProductVariantResponse[],
}