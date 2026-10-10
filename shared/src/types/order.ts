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
    /** Money received that doesn't match what's owed (too little, wrong currency): waits for staff. */
    HELD: 'HELD',
    /** Captured money taken back by the provider (e.g. chargeback): waits for staff. */
    REVERSED: 'REVERSED',
} as const;

export type PaymentStatus = typeof PAYMENT_STATUS[keyof typeof PAYMENT_STATUS];

/** What an admin can do to an order right now, as decided by the server's Order lifecycle. */
export const ORDER_ACTION = {
    CANCEL: 'cancel',
    MARK_PAID: 'mark_paid',
    MARK_DELIVERED: 'mark_delivered',
    /** Accept a payment reversal as lost (needs a note). */
    WRITE_OFF: 'write_off',
    /** Record money returned to the customer (the payments panel offers it; amounts are checked there). */
    REFUND: 'refund',
} as const;

export type OrderAction = typeof ORDER_ACTION[keyof typeof ORDER_ACTION];

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
    /** Returned when an online order is placed: lets a guest check or retry payment for it. */
    access_token?: string;
    /** Admin actions the order allows in its current state (empty for managers' purposes too — they can't act). */
    available_actions?: OrderAction[];
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
    /**
     * `EXPIRED`: cancelled for non-payment (if `payment_status` is PAID, money arrived late and is owed back).
     * `REVIEW`: money arrived but not the right amount — held for staff; don't ask the customer to pay again.
     */
    status: typeof ORDER_STATUS.PENDING | typeof PAYMENT_STATUS.PAID | typeof PAYMENT_STATUS.FAILED | 'EXPIRED' | 'REVIEW';
    order_id: number;
    order_ref?: string;
    order_number?: string | null;
    total_amount?: number;
    order_status?: string;
    payment_status?: string;
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

/** How a refund was paid back to the customer. Refunds are recorded after staff send the money. */
export const REFUND_METHOD = {
    MPESA: 'MPESA',
    PESAPAL: 'PESAPAL',
    CASH: 'CASH',
    BANK_TRANSFER: 'BANK_TRANSFER',
    OTHER: 'OTHER',
} as const;
export type RefundMethod = typeof REFUND_METHOD[keyof typeof REFUND_METHOD];

/**
 * Money position of an order, from its ledger.
 * - `unpaid`: nothing received
 * - `paid`: received the order total
 * - `partially_refunded` / `refunded`: some / all of it given back
 * - `refund_owed`: order cancelled but money still held (e.g. paid after it expired)
 * - `underpaid` / `overpaid`: received less / more than the order total
 * - `reversed`: the payment provider took the money back (chargeback / reversal)
 */
export type OrderPaymentState =
    | 'unpaid'
    | 'paid'
    | 'partially_refunded'
    | 'refunded'
    | 'refund_owed'
    | 'underpaid'
    | 'overpaid'
    | 'reversed';

export interface OrderPaymentSummary {
    order_total: number;
    captured: number;
    refunded: number;
    /** Taken back by the payment provider (chargebacks / reversals). */
    reversed: number;
    /** captured − refunded − reversed (what the customer has paid and not had back) */
    net: number;
    /** Payment provider fees recorded from statements. Not deducted from what can be refunded. */
    fees: number;
    /** net − fees: what the shop actually keeps. */
    net_after_fees: number;
    /** Most that can still be refunded. */
    refundable: number;
    state: OrderPaymentState;
    /** Marked paid before the ledger existed, so `captured` is assumed to be the order total. */
    legacy_unrecorded_capture: boolean;
}

export interface LedgerEntryResponse {
    id: string;
    entry_type: string;
    direction: 'CREDIT' | 'DEBIT';
    amount: number;
    currency: string;
    reference: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
}

export interface OrderPaymentsResponse {
    summary: OrderPaymentSummary;
    entries: LedgerEntryResponse[];
}

export interface RecordRefundRequest {
    amount: number;
    method: RefundMethod;
    /** M-Pesa / bank transaction code for the refund, if any. */
    external_reference?: string;
    reason: string;
    /** Generated once per refund form; makes double-submits record a single refund. */
    idempotency_key: string;
}

/** Something in orders, Pesapal transactions or the ledger that doesn't add up. */
export type ReconciliationIssueKind =
    | 'paid_without_capture'
    | 'completed_payment_without_capture'
    | 'held_for_review'
    | 'amount_mismatch'
    | 'refund_owed'
    | 'marked_paid_manually'
    | 'payment_reversed';

export interface ReconciliationIssue {
    kind: ReconciliationIssueKind;
    order_id: string;
    order_number: string | null;
    amount: number | null;
    expected: number | null;
    message: string;
}

export interface ReconciliationReport {
    from: string;
    to: string;
    totals: {
        captured: number;
        refunded: number;
        /** Taken back by the payment provider. Money out, like refunds. */
        reversed: number;
        fees: number;
        net: number;
        net_after_fees: number;
        paid_orders: number;
    };
    issues: ReconciliationIssue[];
}

export interface StatementIssueResponse {
    row: number;
    kind: 'not_in_ledger' | 'amount_mismatch' | 'unknown_reference' | 'not_successful' | 'unreadable_amount';
    reference: string | null;
    order_number: string | null;
    statement_amount: number | null;
    ledger_amount: number | null;
    message: string;
}

export interface StatementReconciliationReport {
    /** Which statement column was used for what — check these if results look wrong. */
    columns: Record<string, string | null>;
    rows: number;
    matched: number;
    fees_found: number;
    fees_total: number;
    /** False for a preview; true when fees were written to the ledger. */
    recorded: boolean;
    fees_recorded: number;
    issues: StatementIssueResponse[];
    /** Payments in the ledger, dated within the statement's range, that the statement doesn't list. */
    missing_from_statement: { order_number: string | null; reference: string | null; amount: number; date: string }[];
    date_range: { from: string; to: string } | null;
}
