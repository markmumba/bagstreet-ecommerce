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

export const ORDER_SOURCE = {
    ONLINE: 'ONLINE',
    WALK_IN: 'WALK_IN',
} as const;

export type OrderSource = typeof ORDER_SOURCE[keyof typeof ORDER_SOURCE];

export const WALK_IN_PAYMENT_METHOD = {
    CASH: 'CASH',
    CARD: 'CARD',
    BANK_TRANSFER: 'BANK_TRANSFER',
    PESAPAL: 'PESAPAL',
    OTHER: 'OTHER',
} as const;

export type WalkInPaymentMethod = typeof WALK_IN_PAYMENT_METHOD[keyof typeof WALK_IN_PAYMENT_METHOD];

export interface ShippingAddress {
    full_name: string;
    email?: string;
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
    order_source?: OrderSource;
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
    email?: string;
    discount_code?: string;
    notes?: string;
}

export interface WalkInSaleRequest {
    items: { variant_id: number; quantity: number }[];
    payment_method: WalkInPaymentMethod;
    customer_name?: string;
    customer_phone?: string;
    customer_email?: string;
    notes?: string;
}

export interface WalkInCatalogItemResponse {
    product_id: string;
    product_name: string;
    product_sku: string;
    product_slug?: string;
    image_url?: string;
    variant_id: string;
    variant_sku: string;
    variant_size?: string;
    variant_color?: string;
    stock: number;
    unit_price: number;
    is_on_sale: boolean;
}

export interface OrderItemResponse {
    id: string;
    product_id: string;
    product_slug?: string;
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
    public_id?: string;
    order_number?: string;
    user_id: string;
    status: OrderStatus;
    order_source?: OrderSource;
    total_amount: number;
    shipping_cost: number;
    discount_code?: string;
    discount_amount: number;
    payment_status: PaymentStatus;
    shipping_location_id?: string;
    shipping_address: ShippingAddress;
    notes?: string;
    items: OrderItemResponse[];
    payment_provider?: string;
    payment_redirect_url?: string | null;
    payment_reference?: string | null;
    created_at: string;
    updated_at: string;
}

export interface PaymentRetryResponse {
    checkout_request_id: string;
    payment_provider?: string;
    payment_reference?: string | null;
    payment_redirect_url?: string | null;
}

export interface PaymentStatusResponse {
    status: typeof ORDER_STATUS.PENDING | typeof PAYMENT_STATUS.PAID | typeof PAYMENT_STATUS.FAILED;
    order_id: number;
    receipt_number?: string;
    payment_method?: string;
}

export interface OrderReceiptResponse {
    receipt_number: string;
    order_id: string;
    order_number?: string;
    order_public_id?: string;
    issued_at: string;
    paid_at: string;
    customer_name: string;
    customer_email?: string;
    customer_phone?: string;
    payment_provider: string;
    payment_method?: string;
    payment_reference?: string | null;
    currency: string;
    subtotal: number;
    shipping_cost: number;
    discount_amount: number;
    total_amount: number;
    items: OrderItemResponse[];
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
