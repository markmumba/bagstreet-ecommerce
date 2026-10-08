import type { ReconciliationIssue } from 'shared/dist';
import { roundMoney } from '@server/lib/pricing';

const TOLERANCE = 0.5;

/** One order's money facts, gathered by the reconciliation query. */
export interface ReconciliationOrderRow {
    order_id: number;
    order_number: string | null;
    total_amount: number;
    status: string;
    payment_status: string;
    order_source: string;
    captured: number;
    refunded: number;
    /** Taken back by the payment provider. */
    reversed: number;
    /** Staff accepted the reversal as lost. */
    reversal_written_off: boolean;
    /** A Pesapal transaction for this order is COMPLETED. */
    has_completed_provider_payment: boolean;
}

const kes = (n: number) => `KES ${n.toFixed(2)}`;

/** Everything about one order that doesn't add up. Pure, so it's unit-tested. */
export function classifyOrderForReconciliation(row: ReconciliationOrderRow): ReconciliationIssue[] {
    const issues: ReconciliationIssue[] = [];
    const base = { order_id: String(row.order_id), order_number: row.order_number };
    const total = roundMoney(row.total_amount);
    const captured = roundMoney(row.captured);
    // What was received and not taken back by the provider (refunds are a separate decision).
    const kept = roundMoney(captured - row.reversed);
    const net = roundMoney(kept - row.refunded);
    const paid = row.payment_status === 'PAID';
    const cancelled = row.status === 'CANCELLED';

    // A reversal waits for staff: cancel and restock, mark paid again, or write off. Nothing else
    // about the order is meaningful until then.
    if (row.payment_status === 'REVERSED') {
        if (!cancelled && !row.reversal_written_off) {
            issues.push({ ...base, kind: 'payment_reversed', amount: roundMoney(row.reversed), expected: null,
                message: `The payment provider took back ${kes(row.reversed)}. Cancel and restock, mark it paid if they paid another way, or write it off.` });
        }
        return issues;
    }

    if (paid && captured === 0) {
        issues.push({ ...base, kind: 'paid_without_capture', amount: null, expected: total,
            message: 'Marked paid, but no payment is recorded in the ledger.' });
    }
    if (row.has_completed_provider_payment && captured === 0) {
        issues.push({ ...base, kind: 'completed_payment_without_capture', amount: null, expected: total,
            message: 'Pesapal shows this payment completed, but the ledger has no record of it.' });
    }
    if (!paid && !cancelled && captured > 0) {
        issues.push({ ...base, kind: 'held_for_review', amount: captured, expected: total,
            message: `Received ${kes(captured)} against ${kes(total)} — held for review, order not confirmed.` });
    } else if (paid && !cancelled && kept > 0 && Math.abs(kept - total) > TOLERANCE) {
        issues.push({ ...base, kind: 'amount_mismatch', amount: kept, expected: total,
            message: kept > total
                ? `Overpaid by ${kes(kept - total)} — refund the difference.`
                : `Accepted ${kes(total - kept)} short of the order total.` });
    }
    if (cancelled && net > TOLERANCE) {
        issues.push({ ...base, kind: 'refund_owed', amount: net, expected: 0,
            message: `Order is cancelled but ${kes(net)} has not been refunded.` });
    }
    if (paid && !cancelled && row.order_source === 'ONLINE' && !row.has_completed_provider_payment) {
        issues.push({ ...base, kind: 'marked_paid_manually', amount: captured || null, expected: total,
            message: 'Online order marked paid without a completed Pesapal payment — confirm the money arrived.' });
    }
    return issues;
}
