export type StockLevel = 'low' | 'out';

/**
 * Whether a stock change should alert staff. Only a fall that *crosses* the variant's threshold (or
 * reaches zero) alerts; a variant that is already low doesn't alert again on every sale, and
 * restocking never alerts.
 */
export function stockCrossing(before: number, after: number, threshold: number): StockLevel | null {
    if (after >= before) return null;
    if (after <= 0) return before > 0 ? 'out' : null;
    if (after <= threshold && before > threshold) return 'low';
    return null;
}
