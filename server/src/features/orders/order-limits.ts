/**
 * Limits on placing online orders, per customer phone number and per email.
 *
 * Checkout needs no account, so without these a script could place order after order: each one
 * holds stock until it expires and can send M-Pesa prompts to any number it types. Real customers
 * rarely have more than one unpaid order, so these limits are invisible to them.
 *
 * Phone/email (not IP) is the main key because Kenyan mobile networks share IP addresses
 * between many customers; the IP limit in index.ts is only a loose backstop.
 */
export const ORDER_LIMITS = {
    /** Unpaid orders a customer can have open at once. */
    maxOpenUnpaid: 2,
    /** Orders a customer can place in one rolling hour, paid or not. */
    maxPerHour: 5,
} as const;

export interface CustomerOrderCounts {
    /** Open online orders not yet paid (PENDING, UNPAID or FAILED payment). */
    openUnpaid: number;
    /** Online orders created in the last hour, any status. */
    lastHour: number;
}

/** Returns a customer-facing reason when the next order would exceed a limit, otherwise null. */
export function orderLimitViolation(counts: CustomerOrderCounts, limits = ORDER_LIMITS): string | null {
    if (counts.openUnpaid >= limits.maxOpenUnpaid) {
        return `You already have ${counts.openUnpaid} unpaid orders. Please complete payment for one of them, `
            + 'or wait — unpaid orders are released automatically after a short time.';
    }
    if (counts.lastHour >= limits.maxPerHour) {
        return 'Too many orders have been placed with this phone number or email in the last hour. '
            + 'Please try again later, or message us on WhatsApp and we will help.';
    }
    return null;
}
