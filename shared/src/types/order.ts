import type { BaseType } from './baseType';

export type OrderStatus =
    | 'PENDING'
    | 'CONFIRMED'
    | 'PROCESSING'
    | 'SHIPPED'
    | 'DELIVERED'
    | 'CANCELLED'
    | 'REFUNDED';

export interface ShippingAddress {
    full_name: string;
    address_line1: string;
    address_line2?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
    phone?: string;
}

export interface Order extends BaseType {
    user_id: number;
    status: OrderStatus;
    total_amount: number;
    shipping_address: ShippingAddress;
    notes?: string;
}

export interface OrderItem {
    id: string;
    order_id: string;
    product_id: number;
    variant_id?: number;
    quantity: number;
    unit_price: number;
    subtotal: number;
    created_at: string;
}

export interface OrderCreateRequest {
    items: { variant_id: number; quantity: number }[];
    shipping_address: ShippingAddress;
    notes?: string;
}

export interface OrderItemResponse {
    id: string;
    product_id: string;
    product_name: string;
    variant_id?: string;
    variant_sku?: string;
    variant_size?: string;
    variant_color?: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
}

export interface OrderResponse {
    id: string;
    user_id: string;
    status: OrderStatus;
    total_amount: number;
    shipping_address: ShippingAddress;
    notes?: string;
    items: OrderItemResponse[];
    created_at: string;
    updated_at: string;
}
