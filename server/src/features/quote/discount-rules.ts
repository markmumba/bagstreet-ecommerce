import { roundMoney } from '../../lib/pricing';

/** The discount-code fields the rules need (a `discount_codes` row). */
export interface DiscountRuleCode {
    code: string;
    value: string | number;
    min_order_amount: string | number | null;
    usage_limit: number | null;
    used_count: number;
    expires_at: string | Date | null;
    is_active: boolean;
    /** Only signed-in customers may use it, once per account (database default: true). */
    requires_account?: boolean;
}

export type DiscountVerdict =
    | { ok: true; amount: number }
    | { ok: false; reason: string };

/**
 * The one set of discount rules. The quote runs it to show the customer what they'd get; order
 * creation runs it again with the code row locked, so the limit can't be exceeded by two
 * checkouts at once. Percentage off the subtotal (before delivery), rounded down to whole shillings.
 */
export function evaluateDiscount(
    code: DiscountRuleCode | undefined,
    { subtotal, phoneAlreadyUsed, signedIn, accountAlreadyUsed, now = Date.now() }: {
        subtotal: number;
        phoneAlreadyUsed: boolean;
        signedIn: boolean;
        accountAlreadyUsed: boolean;
        now?: number;
    },
): DiscountVerdict {
    if (!code) return { ok: false, reason: 'Discount code was not found' };
    if (!code.is_active) return { ok: false, reason: 'Discount code is not active' };
    if (code.expires_at && new Date(code.expires_at).getTime() < now) return { ok: false, reason: 'Discount code has expired' };
    if (code.usage_limit != null && code.used_count >= code.usage_limit) {
        return { ok: false, reason: 'Discount code usage limit has been reached' };
    }
    if (code.requires_account && !signedIn) return { ok: false, reason: 'Sign in to use this code' };
    const minimum = Number(code.min_order_amount ?? 0);
    if (subtotal < minimum) return { ok: false, reason: `This code needs an order of at least KES ${minimum.toFixed(2)}` };
    if (phoneAlreadyUsed) return { ok: false, reason: 'This phone number has already used this code' };
    if (accountAlreadyUsed) return { ok: false, reason: 'Your account has already used this code' };

    return { ok: true, amount: roundMoney(Math.floor((subtotal * Number(code.value)) / 100)) };
}
