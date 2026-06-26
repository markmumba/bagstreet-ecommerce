import type { BaseType } from './baseType';

export const ORDER_STATUS = {
    PENDING: 'PENDING',
    CONFIRMED: 'CONFIRMED',
    PROCESSING: 'PROCESSING',
    SHIPPED: 'SHIPPED',
    DELIVERED: 'DELIVERED',
    CANCELLED: 'CANCELLED',
    REFUNDED: 'REFUNDED',
} as const;

export type OrderStatus = typeof ORDER_STATUS[keyof typeof ORDER_STATUS];

export const PAYMENT_STATUS = {
    UNPAID: 'UNPAID',
    PAID: 'PAID',
    FAILED: 'FAILED',
} as const;

export type PaymentStatus = typeof PAYMENT_STATUS[keyof typeof PAYMENT_STATUS];

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
    user_id: number | null;
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
    shipping_location_id: number;
    phone: string;
    discount_code?: string;
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
    shipping_cost: number;
    discount_code?: string;
    discount_amount: number;
    payment_status: PaymentStatus;
    shipping_location_id?: string;
    shipping_address: ShippingAddress;
    notes?: string;
    items: OrderItemResponse[];
    created_at: string;
    updated_at: string;
}

export interface PaymentRetryResponse {
    checkout_request_id: string;
}

export interface PaymentStatusResponse {
    status: typeof ORDER_STATUS.PENDING | typeof PAYMENT_STATUS.PAID;
    order_id: number;
    receipt_number?: string;
}

export interface DiscountCodeResponse {
    id: string;
    code: string;
    value: number;
    min_order_amount: number;
    usage_limit?: number;
    used_count: number;
    expires_at?: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface DiscountValidationResponse {
    valid: boolean;
    code: string;
    discount_amount: number;
    message: string;
}
