/** If the payment provider can't be reached, wait this many payment windows before cancelling anyway. */
const PROVIDER_OUTAGE_GRACE_MULTIPLIER = 3;

export type ProviderCheck = 'none' | 'paid' | 'not_paid' | 'error';

/**
 * Pure decision for one expired order:
 * - paid at the payment provider → keep (it has just been confirmed)
 * - no payment started, or the payment provider says not paid → cancel
 * - the payment provider unreachable → wait, unless the order is far past its window (a late payment is
 *   still handled: the Order lifecycle reinstates the order or records a refund owed)
 */
export function shouldCancelExpiredOrder(check: ProviderCheck, ageMs: number, ttlMs: number): boolean {
    if (check === 'paid') return false;
    if (check === 'error') return ageMs >= ttlMs * PROVIDER_OUTAGE_GRACE_MULTIPLIER;
    return true;
}
