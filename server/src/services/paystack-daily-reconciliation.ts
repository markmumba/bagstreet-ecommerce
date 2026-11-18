/**
 * Daily Paystack reconciliation: once a day, list every Paystack transaction from the previous
 * Nairobi day and compare it with our payment attempts and ledger (pure matching in
 * features/payments/paystack-reconciliation.ts).
 *
 * - Paystack says paid but we have no capture (a lost webhook, often after the order expired):
 *   verify that one transaction and record it through the normal payment path, so the order
 *   lifecycle confirms it, re-opens it, or raises REFUND_REQUIRED as it would for a late webhook.
 * - We still show an attempt pending that Paystack has settled: refresh it.
 * - Anything else that doesn't match: record it and alert admins. Never refund or reverse here.
 *
 * Safe to rerun for the same day: captures are idempotent, issues are stored once per
 * (day, kind, reference), and staff hear only about issues not reported before.
 */
import { createHash } from 'node:crypto';
import { env } from '../config/env';
import { sql } from '../lib/db';
import { log } from '../lib/log';
import { toJsonbParam } from '../lib/json-column';
import { isPaystackConfigured, listTransactions, verifyTransaction } from './paystack';
import { outcomeOfTransaction } from './paystack-protocol';
import { alertStaff, type StaffAlert } from '../features/staff-alerts/staff-alerts';
import { applyAttemptOutcome } from '../features/payments/attempt-outcome';
import { PAYSTACK } from '../features/payments/paystack-payments';
import type { PaymentTransactionRow } from '../features/payments/payments.queries';
import { LEDGER_ENTRY } from '../features/payments/order-balance';
import {
    nairobiDayWindow,
    nairobiHour,
    previousNairobiDay,
    reconcileWithPaystack,
    type OurAttempt,
    type ProviderIssue,
} from '../features/payments/paystack-reconciliation';
import { LEDGER_DIRECTION } from 'shared/dist';

/** paystack_reconciliation_runs.status (stored: never change the values). */
export const RUN_STATUS = {
    RUNNING: 'RUNNING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
} as const;

/** Check every 15 minutes whether yesterday still needs doing. */
const TICK_MS = 15 * 60 * 1000;
const FIRST_TICK_DELAY_MS = 60 * 1000;
/** Run after 03:00 Nairobi, once Paystack has settled the day's late prompts. */
const RUN_AFTER_HOUR = 3;
/** A RUNNING row older than this belongs to a run that died (restart, crash): take it over. */
const STALE_RUN_MINUTES = 60;
/** After this many failed runs for one day, stop retrying it and tell admins. */
const MAX_ATTEMPTS = 8;
/** Ledger captures are named after the attempt (see attempt-outcome.ts). */
const CAPTURE_PREFIX = `${PAYSTACK}:`;

export interface ReconciliationRunSummary {
    day: string;
    paystack_transactions: number;
    our_attempts: number;
    recovered_payments: { order_id: number; order_number: string | null; reference: string; amount: number }[];
    settled_pending: number;
    issues: number;
    new_issues: number;
    action_errors: number;
}

const num = (v: unknown) => Number(v ?? 0);

/** What the job needs from outside the database; the integration test swaps in fakes. */
export interface ReconciliationDeps {
    listTransactions: typeof listTransactions;
    verifyTransaction: typeof verifyTransaction;
    alertStaff: (alert: StaffAlert) => Promise<unknown>;
}

const REAL_DEPS: ReconciliationDeps = { listTransactions, verifyTransaction, alertStaff: (alert) => alertStaff(alert) };

/** Takes the day's run, unless it's done, given up on, or in progress. Returns its attempt number. */
async function claimRun(day: string, force: boolean): Promise<number | null> {
    const rows = await sql<{ attempts: number }[]>`
        INSERT INTO paystack_reconciliation_runs (day, status)
        VALUES (${day}, ${RUN_STATUS.RUNNING})
        ON CONFLICT (day) DO UPDATE
        SET status = ${RUN_STATUS.RUNNING}, attempts = paystack_reconciliation_runs.attempts + 1,
            started_at = CURRENT_TIMESTAMP, finished_at = NULL, error = NULL
        WHERE ${force}
           OR (paystack_reconciliation_runs.status = ${RUN_STATUS.FAILED} AND paystack_reconciliation_runs.attempts < ${MAX_ATTEMPTS})
           OR (paystack_reconciliation_runs.status = ${RUN_STATUS.RUNNING}
               AND paystack_reconciliation_runs.started_at < CURRENT_TIMESTAMP - make_interval(mins => ${STALE_RUN_MINUTES}))
        RETURNING attempts
    `;
    return rows[0] ? Number(rows[0].attempts) : null;
}

/** The last retry failed: say so once, rather than leave the day silently unreconciled. */
async function alertGaveUp(deps: ReconciliationDeps, day: string, attempt: number, reason: string) {
    if (attempt < MAX_ATTEMPTS) return;
    await deps.alertStaff({
        audience: 'money',
        type: 'PAYSTACK_RECONCILIATION',
        title: `Paystack reconciliation for ${day} could not finish`,
        body: `Tried ${attempt} times. Last error: ${reason}. Rerun it with \`bun run reconcile:paystack --date ${day}\` once Paystack is reachable, or upload that day's statement on the Reconciliation page.`,
        link: '/reconciliation',
        data: { day },
        dedupeKey: `paystack-reconciliation-failed:${day}`,
    }).catch((err) => log.error('paystack-reconciliation: could not alert staff', { err, day }));
}

async function finishRun(day: string, status: typeof RUN_STATUS.COMPLETED | typeof RUN_STATUS.FAILED, summary: unknown, error: string | null) {
    await sql`
        UPDATE paystack_reconciliation_runs
        SET status = ${status}, finished_at = CURRENT_TIMESTAMP,
            summary = ${toJsonbParam(summary)}::jsonb, error = ${error}
        WHERE day = ${day}
    `;
}

function toAttempt(r: any): OurAttempt {
    return {
        transactionId: Number(r.id),
        orderId: Number(r.order_id),
        orderNumber: r.order_number ?? null,
        reference: r.provider_reference,
        status: r.status,
        captured: num(r.captured),
        currency: r.currency ?? env.CURRENCY,
        inWindow: Boolean(r.in_window),
    };
}

/** Our Paystack attempts started in the fetch window, plus any Paystack listed that started earlier. */
async function loadAttempts(window: ReturnType<typeof nairobiDayWindow>, listedReferences: string[]): Promise<OurAttempt[]> {
    const start = window.start.toISOString();
    const end = window.end.toISOString();
    const rows = await sql<any[]>`
        SELECT t.id, t.order_id, o.order_number, t.provider_reference, t.status, t.currency,
               (t.created_at >= ${start} AND t.created_at < ${end}) AS in_window,
               COALESCE((SELECT SUM(l.amount) FROM payment_ledger_entries l
                         WHERE l.entry_type = ${LEDGER_ENTRY.PAYMENT_CAPTURED} AND l.direction = ${LEDGER_DIRECTION.CREDIT}
                           AND l.reference = ${CAPTURE_PREFIX} || t.provider_reference), 0) AS captured
        FROM payment_transactions t
        JOIN orders o ON o.id = t.order_id
        WHERE t.provider = ${PAYSTACK} AND t.provider_reference IS NOT NULL
          AND t.created_at >= ${window.fetchFrom.toISOString()} AND t.created_at < ${window.fetchTo.toISOString()}
    `;
    const attempts = rows.map(toAttempt);
    const known = new Set(attempts.map((a) => a.reference.toUpperCase()));

    // A prompt sent before the window that Paystack dates inside it (rare: retried, delayed).
    for (const reference of listedReferences) {
        if (known.has(reference.toUpperCase())) continue;
        const [row] = await sql<any[]>`
            SELECT t.id, t.order_id, o.order_number, t.provider_reference, t.status, t.currency,
                   (t.created_at >= ${start} AND t.created_at < ${end}) AS in_window,
                   COALESCE((SELECT SUM(l.amount) FROM payment_ledger_entries l
                             WHERE l.entry_type = ${LEDGER_ENTRY.PAYMENT_CAPTURED} AND l.direction = ${LEDGER_DIRECTION.CREDIT}
                               AND l.reference = ${CAPTURE_PREFIX} || t.provider_reference), 0) AS captured
            FROM payment_transactions t
            JOIN orders o ON o.id = t.order_id
            WHERE t.provider = ${PAYSTACK} AND upper(t.provider_reference) = ${reference.toUpperCase()}
            ORDER BY t.created_at DESC LIMIT 1
        `;
        if (row) {
            attempts.push(toAttempt(row));
            known.add(reference.toUpperCase());
        }
    }
    return attempts;
}

async function transactionRow(id: number): Promise<PaymentTransactionRow> {
    const [row] = await sql<PaymentTransactionRow[]>`SELECT * FROM payment_transactions WHERE id = ${id}`;
    if (!row) throw new Error(`payment transaction ${id} disappeared`);
    return row;
}

async function capturedFor(reference: string): Promise<number> {
    const [row] = await sql<{ total: string }[]>`
        SELECT COALESCE(SUM(amount), 0) AS total FROM payment_ledger_entries
        WHERE entry_type = ${LEDGER_ENTRY.PAYMENT_CAPTURED} AND direction = ${LEDGER_DIRECTION.CREDIT} AND reference = ${CAPTURE_PREFIX + reference}
    `;
    return num(row?.total);
}

/** Stores issues; returns the ones not seen before for this day. */
async function recordIssues(day: string, issues: ProviderIssue[]): Promise<ProviderIssue[]> {
    const fresh: ProviderIssue[] = [];
    for (const issue of issues) {
        const rows = await sql<{ id: number }[]>`
            INSERT INTO paystack_reconciliation_issues (day, kind, reference, order_id, paystack_amount, our_amount, message)
            VALUES (${day}, ${issue.kind}, ${issue.reference}, ${issue.orderId}, ${issue.paystackAmount}, ${issue.ourAmount}, ${issue.message})
            ON CONFLICT (day, kind, reference) DO NOTHING
            RETURNING id
        `;
        if (rows.length > 0) fresh.push(issue);
    }
    return fresh;
}

function alertBody(summary: ReconciliationRunSummary, fresh: ProviderIssue[]): string {
    const lines: string[] = [];
    if (summary.recovered_payments.length > 0) {
        lines.push(`Recorded ${summary.recovered_payments.length} payment(s) Paystack received that we had missed: `
            + summary.recovered_payments.map((p) => p.order_number ?? `order ${p.order_id}`).join(', ') + '.');
    }
    for (const issue of fresh.slice(0, 10)) {
        lines.push(`${issue.orderNumber ?? issue.reference}: ${issue.message}`);
    }
    if (fresh.length > 10) lines.push(`…and ${fresh.length - 10} more.`);
    return lines.join('\n');
}

/**
 * Reconciles one Nairobi day (YYYY-MM-DD). Returns null when the day is already done or being
 * done, unless `force`. Throws (and marks the run FAILED, to be retried) if Paystack can't be read.
 */
export async function reconcilePaystackDay(day: string, opts: { force?: boolean; deps?: Partial<ReconciliationDeps> } = {}): Promise<ReconciliationRunSummary | null> {
    const deps: ReconciliationDeps = { ...REAL_DEPS, ...opts.deps };
    const window = nairobiDayWindow(day);
    const attempt = await claimRun(day, opts.force ?? false);
    if (attempt === null) return null;

    try {
        const listed = await deps.listTransactions(window.fetchFrom, window.fetchTo);
        const attempts = await loadAttempts(window, listed.map((t) => t.reference));
        const { actions, issues } = reconcileWithPaystack(listed, attempts);

        const summary: ReconciliationRunSummary = {
            day, paystack_transactions: listed.length, our_attempts: attempts.length,
            recovered_payments: [], settled_pending: 0, issues: 0, new_issues: 0, action_errors: 0,
        };
        const allIssues = [...issues];

        for (const action of actions) {
            const ours = action.attempt;
            try {
                const tx = await transactionRow(ours.transactionId);
                // Act on verify, as the webhook path does, never on the list entry alone.
                const verified = await deps.verifyTransaction(ours.reference);
                const ageMs = Date.now() - new Date(tx.created_at).getTime();
                const outcome = verified ? outcomeOfTransaction(verified.data, ageMs) : null;

                if (action.kind === 'settle_stale_pending') {
                    if (outcome && outcome.state !== 'pending') {
                        await applyAttemptOutcome(tx, outcome, {
                            paymentMethod: 'M-Pesa (Paystack)',
                            resultDesc: (verified?.data as any)?.gateway_response ?? null,
                            raw: { verify: verified?.raw ?? null, settled_by: `paystack-reconciliation:${day}` },
                        });
                        if (outcome.state === 'paid') {
                            summary.recovered_payments.push({ order_id: ours.orderId, order_number: ours.orderNumber, reference: ours.reference, amount: await capturedFor(ours.reference) });
                        } else {
                            summary.settled_pending += 1;
                        }
                    }
                    continue;
                }

                if (outcome?.state !== 'paid') {
                    allIssues.push({
                        kind: 'verify_disagrees', reference: ours.reference, orderId: ours.orderId, orderNumber: ours.orderNumber,
                        paystackAmount: action.provider.amount, ourAmount: null,
                        message: `Paystack's transaction list shows this paid, but verifying it says "${outcome?.state ?? 'not found'}". Check it in the Paystack dashboard.`,
                    });
                    continue;
                }
                await applyAttemptOutcome(tx, outcome, {
                    paymentMethod: 'M-Pesa (Paystack)',
                    resultDesc: (verified?.data as any)?.gateway_response ?? null,
                    raw: { verify: verified?.raw ?? null, recovered_by: `paystack-reconciliation:${day}` },
                });
                const captured = await capturedFor(ours.reference);
                if (captured > 0) {
                    summary.recovered_payments.push({ order_id: ours.orderId, order_number: ours.orderNumber, reference: ours.reference, amount: captured });
                    log.warn('paystack-reconciliation: recorded a missed payment', { day, order_id: ours.orderId, reference: ours.reference, amount: captured });
                } else {
                    allIssues.push({
                        kind: 'capture_not_recorded', reference: ours.reference, orderId: ours.orderId, orderNumber: ours.orderNumber,
                        paystackAmount: outcome.amount ?? action.provider.amount, ourAmount: 0,
                        message: 'Paystack confirmed this payment, but recording it did not add it to the ledger. Check the order.',
                    });
                }
            } catch (err) {
                summary.action_errors += 1;
                log.error('paystack-reconciliation: action failed', { err, day, kind: action.kind, reference: ours.reference });
            }
        }

        const fresh = await recordIssues(day, allIssues);
        summary.issues = allIssues.length;
        summary.new_issues = fresh.length;

        if (fresh.length > 0 || summary.recovered_payments.length > 0) {
            await deps.alertStaff({
                audience: 'money',
                type: 'PAYSTACK_RECONCILIATION',
                title: fresh.length > 0
                    ? `Paystack reconciliation for ${day}: ${fresh.length} thing(s) to check`
                    : `Paystack reconciliation for ${day}: missed payments recorded`,
                body: alertBody(summary, fresh),
                link: '/reconciliation',
                data: { day },
                // Same findings, same email: a rerun that finds nothing new sends nothing.
                dedupeKey: `paystack-reconciliation:${day}:${createHash('sha256')
                    .update(JSON.stringify([summary.recovered_payments.map((p) => p.reference), fresh.map((i) => `${i.kind}/${i.reference}`)]))
                    .digest('hex').slice(0, 16)}`,
            });
        }

        // Some actions failed (Paystack hiccup): leave the day FAILED so the next tick retries it.
        const status = summary.action_errors > 0 ? RUN_STATUS.FAILED : RUN_STATUS.COMPLETED;
        const error = status === RUN_STATUS.FAILED ? `${summary.action_errors} action(s) failed` : null;
        await finishRun(day, status, summary, error);
        if (error) await alertGaveUp(deps, day, attempt, error);
        log.info('paystack-reconciliation: run finished', { ...summary, recovered_payments: summary.recovered_payments.length, status });
        return summary;
    } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        await finishRun(day, RUN_STATUS.FAILED, null, reason).catch(() => {});
        await alertGaveUp(deps, day, attempt, reason);
        throw err;
    }
}

/** Starts the daily check. Off when Paystack isn't configured (development). */
export function startPaystackReconciliation() {
    if (!isPaystackConfigured()) {
        log.info('paystack-reconciliation: disabled (Paystack not configured)');
        return;
    }
    if (!env.PAYSTACK_RECONCILIATION_ENABLED) {
        log.info('paystack-reconciliation: disabled (PAYSTACK_RECONCILIATION_ENABLED=false)');
        return;
    }

    let running = false;
    const tick = async () => {
        if (running || nairobiHour() < RUN_AFTER_HOUR) return;
        running = true;
        try {
            await reconcilePaystackDay(previousNairobiDay());
        } catch (err) {
            log.error('paystack-reconciliation: run failed, will retry', { err });
        } finally {
            running = false;
        }
    };

    setTimeout(tick, FIRST_TICK_DELAY_MS);
    setInterval(tick, TICK_MS);
    log.info('paystack-reconciliation: started', { run_after_hour_nairobi: RUN_AFTER_HOUR });
}
