/**
 * Values stored on payment_transactions (one row per payment attempt).
 */

/**
 * Status of one payment attempt with a provider (payment_transactions.status).
 * Values are stored in the database: never change them, only add.
 */
export const PAYMENT_ATTEMPT_STATUS = {
    /** Recorded before the provider was asked. */
    INITIATED: 'INITIATED',
    /** The prompt was sent; waiting for the customer / provider. */
    PENDING: 'PENDING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    CANCELLED: 'CANCELLED',
    REVERSED: 'REVERSED',
} as const;

export type PaymentAttemptStatus = typeof PAYMENT_ATTEMPT_STATUS[keyof typeof PAYMENT_ATTEMPT_STATUS];

/** payment_transactions.provider. Older rows may name retired providers (pesapal, daraja). */
export const PAYMENT_PROVIDER = {
    PAYSTACK: 'paystack',
} as const;
