/**
 * Daily check of Paystack's own record against ours — pure matching (no network, no database),
 * unit-tested. The job that fetches both sides and acts on the result is
 * services/paystack-daily-reconciliation.ts.
 *
 * Paystack's list is what actually happened; our tables are what we think happened. The webhook,
 * status polling and the expiry job all ask Paystack about one attempt at a time and can miss
 * one (a lost webhook after the order expired, an attempt marked failed that later succeeded).
 * This sweep catches those.
 */
import { roundMoney } from '@server/lib/pricing';

const TOLERANCE = 0.5;

/** Mock references from development (Paystack not configured) never reach Paystack. */
const MOCK_PREFIX = 'mock-paystack-';

/** A Paystack transaction from the List Transactions API. */
export interface ProviderTransaction {
    reference: string;
    status: string;
    amount: number;
    currency: string;
}

/** One of our Paystack payment attempts, with what the ledger holds for it. */
export interface OurAttempt {
    transactionId: number;
    orderId: number;
    orderNumber: string | null;
    reference: string;
    /** PENDING, COMPLETED, FAILED, … on payment_transactions. */
    status: string;
    /** The PAYMENT_CAPTURED ledger amount for this attempt (reference `paystack:<ref>`); 0 if none. */
    captured: number;
    currency: string;
    /** Whether the attempt was started inside the day being reconciled (not the slack around it). */
    inWindow: boolean;
}

export type ReconciliationAction =
    /** Paystack says paid; we have no capture for it. Re-verify and record the payment. */
    | { kind: 'record_missed_payment'; attempt: OurAttempt; provider: ProviderTransaction }
    /** Paystack has settled it (failed/abandoned/reversed) but we still show it pending. */
    | { kind: 'settle_stale_pending'; attempt: OurAttempt; provider: ProviderTransaction };

export type ProviderIssueKind =
    | 'unknown_reference'
    | 'amount_mismatch'
    | 'not_successful_at_paystack'
    | 'missing_at_paystack'
    /** The list said paid, but verifying the single transaction did not (set by the job). */
    | 'verify_disagrees'
    /** A missed payment was applied but the ledger still has no capture for it (set by the job). */
    | 'capture_not_recorded';

export interface ProviderIssue {
    kind: ProviderIssueKind;
    reference: string;
    orderId: number | null;
    orderNumber: string | null;
    paystackAmount: number | null;
    ourAmount: number | null;
    message: string;
}

const kes = (n: number) => `KES ${n.toFixed(2)}`;

const SETTLED_UNPAID = new Set(['failed', 'abandoned', 'reversed']);

/**
 * Compares a day's Paystack transactions with our attempts. `provider` should cover the day plus
 * some slack either side; `ours` likewise, with `inWindow` marking the day itself, so an attempt
 * near midnight is never reported missing just because Paystack dated it a second later.
 */
export function reconcileWithPaystack(provider: ProviderTransaction[], ours: OurAttempt[]): {
    actions: ReconciliationAction[];
    issues: ProviderIssue[];
} {
    const actions: ReconciliationAction[] = [];
    const issues: ProviderIssue[] = [];
    const oursByRef = new Map(ours.map((a) => [a.reference.toUpperCase(), a]));
    const providerByRef = new Map(provider.map((p) => [p.reference.toUpperCase(), p]));

    for (const p of provider) {
        const status = p.status.toLowerCase();
        const attempt = oursByRef.get(p.reference.toUpperCase());

        if (!attempt) {
            // Someone paid us with a reference we never issued (another integration, a manual
            // payment link). Only money received matters.
            if (status === 'success') {
                issues.push({
                    kind: 'unknown_reference', reference: p.reference, orderId: null, orderNumber: null,
                    paystackAmount: roundMoney(p.amount), ourAmount: null,
                    message: `Paystack received ${kes(p.amount)} with reference ${p.reference}, which matches no Bagstreet payment.`,
                });
            }
            continue;
        }

        if (status === 'success') {
            if (attempt.captured === 0) {
                actions.push({ kind: 'record_missed_payment', attempt, provider: p });
            } else if (
                Math.abs(roundMoney(attempt.captured) - roundMoney(p.amount)) > TOLERANCE
                || attempt.currency.toUpperCase() !== p.currency.toUpperCase()
            ) {
                issues.push({
                    kind: 'amount_mismatch', reference: p.reference, orderId: attempt.orderId, orderNumber: attempt.orderNumber,
                    paystackAmount: roundMoney(p.amount), ourAmount: roundMoney(attempt.captured),
                    message: `Paystack shows ${p.currency} ${p.amount.toFixed(2)}, our ledger recorded ${attempt.currency} ${attempt.captured.toFixed(2)}.`,
                });
            }
            continue;
        }

        if (SETTLED_UNPAID.has(status)) {
            if (attempt.captured > 0) {
                issues.push({
                    kind: 'not_successful_at_paystack', reference: p.reference, orderId: attempt.orderId, orderNumber: attempt.orderNumber,
                    paystackAmount: null, ourAmount: roundMoney(attempt.captured),
                    message: status === 'reversed'
                        ? `Paystack reversed this payment, but the order still counts ${kes(attempt.captured)} as received.`
                        : `We recorded ${kes(attempt.captured)} as received, but Paystack shows the payment as ${status}.`,
                });
            } else if (attempt.status === 'PENDING') {
                actions.push({ kind: 'settle_stale_pending', attempt, provider: p });
            }
        }
        // pending/ongoing/processing at Paystack: nothing to say yet.
    }

    // Money we recorded that Paystack has no transaction for at all.
    for (const attempt of ours) {
        if (!attempt.inWindow || attempt.captured === 0) continue;
        if (attempt.reference.startsWith(MOCK_PREFIX)) continue;
        if (providerByRef.has(attempt.reference.toUpperCase())) continue;
        issues.push({
            kind: 'missing_at_paystack', reference: attempt.reference, orderId: attempt.orderId, orderNumber: attempt.orderNumber,
            paystackAmount: null, ourAmount: roundMoney(attempt.captured),
            message: `We recorded ${kes(attempt.captured)} as received, but Paystack has no transaction with this reference.`,
        });
    }

    return { actions, issues };
}

/** The day being reconciled, in Nairobi time: [start, end) as instants, plus the slack window. */
export function nairobiDayWindow(day: string, slackMs: number = 60 * 60 * 1000) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) {
        throw new Error(`Not a date (YYYY-MM-DD): ${day}`);
    }
    // Kenya has no daylight saving: midnight in Nairobi is always 21:00 UTC the day before.
    const start = new Date(`${day}T00:00:00+03:00`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { start, end, fetchFrom: new Date(start.getTime() - slackMs), fetchTo: new Date(end.getTime() + slackMs) };
}

/** Yesterday's date in Nairobi, as YYYY-MM-DD. */
export function previousNairobiDay(now: Date = new Date()): string {
    const nairobiNow = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    nairobiNow.setUTCDate(nairobiNow.getUTCDate() - 1);
    return nairobiNow.toISOString().slice(0, 10);
}

/** The hour of day in Nairobi (0–23). */
export function nairobiHour(now: Date = new Date()): number {
    return (now.getUTCHours() + 3) % 24;
}
