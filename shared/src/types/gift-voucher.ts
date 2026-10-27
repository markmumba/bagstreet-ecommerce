/** Gift vouchers (CONTEXT.md › Gift vouchers). */

export const GIFT_VOUCHER_STATUS = {
    ACTIVE: 'active',
    USED: 'used',
    EXPIRED: 'expired',
    VOIDED: 'voided',
} as const;
export type GiftVoucherStatus = typeof GIFT_VOUCHER_STATUS[keyof typeof GIFT_VOUCHER_STATUS];

/** How a voucher sold in the shop was paid for. */
export const VOUCHER_SALE_PAYMENT_METHOD = {
    CASH: 'CASH',
    MPESA: 'MPESA',
    CARD: 'CARD',
    BANK_TRANSFER: 'BANK_TRANSFER',
    OTHER: 'OTHER',
} as const;
export type VoucherSalePaymentMethod = typeof VOUCHER_SALE_PAYMENT_METHOD[keyof typeof VOUCHER_SALE_PAYMENT_METHOD];

export type GiftVoucherMovementKind = 'ISSUED' | 'HELD' | 'REDEEMED' | 'RELEASED' | 'RETURNED' | 'VOIDED' | 'ADJUSTED' | 'CODE_REPLACED';

export interface GiftVoucherResponse {
    id: string;
    /** The last four characters, for finding a voucher; the full code is only shown when issued. */
    code_last4: string;
    initial_amount: number;
    /** What can still be spent. */
    balance: number;
    /** Set aside for unpaid orders. */
    held: number;
    currency: string;
    status: GiftVoucherStatus;
    expires_at: string;
    recipient_name: string | null;
    recipient_phone: string | null;
    recipient_email: string | null;
    message: string | null;
    purchaser_name: string | null;
    sale_payment_method: string;
    sale_reference: string | null;
    /** SHOP (sold at the till) or ONLINE (bought on the storefront). */
    sold_via: string;
    /** The online order it was bought with. */
    purchase_order_number: string | null;
    issued_by_email: string | null;
    voided_at: string | null;
    void_reason: string | null;
    created_at: string;
}

export interface GiftVoucherMovementResponse {
    id: string;
    kind: GiftVoucherMovementKind;
    /** Change to the balance. */
    delta: number;
    amount: number;
    balance_after: number;
    order_id: string | null;
    order_number: string | null;
    note: string | null;
    created_by_email: string | null;
    created_at: string;
}

export interface GiftVoucherDetailResponse extends GiftVoucherResponse {
    movements: GiftVoucherMovementResponse[];
}

/** Returned once, when a voucher is issued: the only time the full code is available. */
export interface IssuedGiftVoucherResponse extends GiftVoucherResponse {
    code: string;
}

export interface GiftVoucherIssueRequest {
    amount: number;
    sale_payment_method: VoucherSalePaymentMethod;
    sale_reference?: string;
    purchaser_name?: string;
    recipient_name?: string;
    recipient_phone?: string;
    recipient_email?: string;
    message?: string;
}

/** Voucher liability: what the shop has been paid for but still owes in goods. */
export interface GiftVoucherSummaryResponse {
    /** Unspent value of live vouchers (balance plus holds): owed to holders. */
    liability: number;
    /** Paid for vouchers issued (excluding voided ones). */
    sold: number;
    /** Spent on orders, net of money given back. */
    redeemed: number;
    /** Left on vouchers that expired unspent. */
    expired_unspent: number;
    counts: Record<GiftVoucherStatus, number>;
}

/** The amounts a voucher can be bought for online (any amount in the shop). */
export const GIFT_VOUCHER_ONLINE_AMOUNTS = [2000, 5000, 10000, 20000] as const;

export const GIFT_VOUCHER_DELIVER_TO = {
    RECIPIENT: 'RECIPIENT',
    BUYER: 'BUYER',
} as const;
export type GiftVoucherDeliverTo = typeof GIFT_VOUCHER_DELIVER_TO[keyof typeof GIFT_VOUCHER_DELIVER_TO];

/** Buying a voucher on the storefront. */
export interface GiftVoucherPurchaseRequest {
    amount: number;
    deliver_to: GiftVoucherDeliverTo;
    recipient_name?: string;
    recipient_email?: string;
    message?: string;
    buyer_name: string;
    buyer_email: string;
    buyer_phone: string;
    policy_acceptance: { accepted: true; version: string };
}

/** A customer checking what is left on their voucher. */
export interface GiftVoucherBalanceResponse {
    balance: number;
    initial_amount: number;
    status: GiftVoucherStatus;
    expires_at: string;
}

/** Returned once when staff replace a lost code: the new code. */
export type ReplacedGiftVoucherCodeResponse = IssuedGiftVoucherResponse;
