/**
 * Staff in-app notification types (in_app_notifications.type). The admin app picks the icon and
 * fallback link by type. Stored: never change the values, only add.
 */
export const NOTIFICATION_TYPE = {
    /** An order was paid (or placed at the counter): fulfil it. */
    NEW_ORDER: 'NEW_ORDER',
    LOW_STOCK: 'LOW_STOCK',
    OUT_OF_STOCK: 'OUT_OF_STOCK',
    /** Money arrived that doesn't match the order (underpaid, overpaid, wrong currency). */
    PAYMENT_MISMATCH: 'PAYMENT_MISMATCH',
    /** Money is held for an order that can't go ahead: refund the customer. */
    REFUND_REQUIRED: 'REFUND_REQUIRED',
    /** The provider took captured money back. */
    PAYMENT_REVERSED: 'PAYMENT_REVERSED',
    /** A further payment arrived for an order that was already paid. */
    PAYMENT_DUPLICATE: 'PAYMENT_DUPLICATE',
    /** The payment prompt could not be sent. */
    PAYMENT_INIT_FAILED: 'PAYMENT_INIT_FAILED',
    /** The daily Paystack reconciliation found something, or could not finish. */
    PAYSTACK_RECONCILIATION: 'PAYSTACK_RECONCILIATION',
    /** An email was given up on after all retries. */
    EMAIL_FAILED: 'EMAIL_FAILED',
    /** A product review is waiting for approval. */
    REVIEW_PENDING: 'REVIEW_PENDING',
} as const;

export type NotificationType = typeof NOTIFICATION_TYPE[keyof typeof NOTIFICATION_TYPE];
