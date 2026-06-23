export interface CartItemResponse {
    id: string;
    variant_id: string;
    product_name: string;
    product_image_url: string;
    variant_sku: string;
    variant_size?: string;
    variant_color?: string;
    unit_price: number;
    quantity: number;
    subtotal: number;
}

export interface CartResponse {
    items: CartItemResponse[];
    total: number;
    item_count: number;
}

export interface AddToCartRequest {
    variant_id: number;
    quantity: number;
}

export interface UpdateCartItemRequest {
    quantity: number;
}
