/** If Pesapal can't be reached, wait this many payment windows before cancelling anyway. */
const PROVIDER_OUTAGE_GRACE_MULTIPLIER = 3;

export type PesapalCheck = 'none' | 'paid' | 'not_paid' | 'error';

/**
 * Pure decision for one expired order:
 * - paid at Pesapal → keep (it has just been confirmed)
 * - no payment started, or Pesapal says not paid → cancel
 * - Pesapal unreachable → wait, unless the order is far past its window (a late payment is
 *   still handled: confirmOrderPayment reinstates the order or flags it for a refund)
 */
export function shouldCancelExpiredOrder(check: PesapalCheck, ageMs: number, ttlMs: number): boolean {
    if (check === 'paid') return false;
    if (check === 'error') return ageMs >= ttlMs * PROVIDER_OUTAGE_GRACE_MULTIPLIER;
    return true;
}
