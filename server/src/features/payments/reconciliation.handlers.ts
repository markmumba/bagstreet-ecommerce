import type { AppContext } from '@server/lib/hono';
import type { ReconciliationReport, StatementReconciliationReport } from 'shared/dist';
import { success } from '@server/lib/response';
import { BadRequestError } from '@server/lib/errors';
import { auditFromContext } from '@server/lib/audit';
import { parseCsv } from '@server/lib/csv-import';
import { roundMoney } from '@server/lib/pricing';
import { reconciliationQueries } from './reconciliation.queries';
import { classifyOrderForReconciliation } from './reconciliation';
import { detectStatementColumns, normaliseStatementRows, reconcileStatementRows, statementColumnProblems } from './statement';

const MAX_STATEMENT_BYTES = 2 * 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` → start of that day (UTC). */
function parseDay(value: string | undefined, label: string): Date | null {
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestError(`${label} must be a date like 2026-10-01`);
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) throw new BadRequestError(`${label} is not a valid date`);
    return date;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

export const reconciliationHandlers = {
    /** Internal check: orders, Pesapal transactions and the ledger, for a date range (default last 30 days). */
    report: async (c: AppContext) => {
        const today = parseDay(day(new Date()), 'today')!;
        const from = parseDay(c.req.query('from'), 'from') ?? new Date(today.getTime() - 29 * DAY_MS);
        const toDay = parseDay(c.req.query('to'), 'to') ?? today;
        if (toDay < from) throw new BadRequestError('"to" must be on or after "from"');
        const toExclusive = new Date(toDay.getTime() + DAY_MS);

        const [totals, orders] = await Promise.all([
            reconciliationQueries.totals(from, toExclusive),
            reconciliationQueries.ordersWithActivity(from, toExclusive),
        ]);
        const net = roundMoney(totals.captured - totals.refunded);

        const report: ReconciliationReport = {
            from: day(from),
            to: day(toDay),
            totals: { ...totals, net, net_after_fees: roundMoney(net - totals.fees) },
            issues: orders.flatMap(classifyOrderForReconciliation),
        };
        return success(c, report);
    },

    /**
     * Pesapal statement import. Multipart: `file` (CSV export) and `record_fees` ("true" to write fees;
     * anything else is a preview). Fees are recorded once per transaction, so re-importing is safe.
     */
    statement: async (c: AppContext) => {
        const form = await c.req.formData().catch(() => null);
        const file = form?.get('file');
        if (!(file instanceof File) || file.size === 0) throw new BadRequestError('Upload the Pesapal statement as a CSV file');
        if (file.size > MAX_STATEMENT_BYTES) throw new BadRequestError('Statement must be 2MB or smaller — export a shorter date range');
        const recordFees = form?.get('record_fees') === 'true';

        const rows = parseCsv(await file.text(), []);
        const columns = detectStatementColumns(Object.keys(rows[0]?.values ?? {}));
        const problems = statementColumnProblems(columns);
        if (problems.length > 0) throw new BadRequestError(`This doesn't look like a Pesapal statement. ${problems.join(' ')}`);

        const statementRows = normaliseStatementRows(rows, columns);
        const { matches, issues, matchedTransactionIds } = reconcileStatementRows(
            statementRows,
            await reconciliationQueries.knownPesapalTransactions(),
        );

        // Dates on the statement bound the "missing from statement" check; skip it if they can't be read.
        const dates = statementRows.map((r) => (r.date ? Date.parse(r.date) : NaN)).filter((t) => Number.isFinite(t));
        let dateRange: StatementReconciliationReport['date_range'] = null;
        let missing: StatementReconciliationReport['missing_from_statement'] = [];
        if (dates.length === statementRows.length && dates.length > 0) {
            const from = new Date(Math.min(...dates));
            const to = new Date(Math.max(...dates) + DAY_MS - 1);
            dateRange = { from: day(from), to: day(to) };
            missing = (await reconciliationQueries.pesapalCapturesBetween(from, to))
                .filter((cap) => !matchedTransactionIds.has(Number(cap.transaction_id)))
                .map((cap) => ({ order_number: cap.order_number, reference: cap.reference, amount: Number(cap.amount), date: String(cap.created_at) }));
        }

        const withFees = matches.filter((m) => m.fee != null && m.fee > 0);
        let feesRecorded = 0;
        if (recordFees) {
            for (const match of withFees) {
                const inserted = await reconciliationQueries.recordProviderFee({
                    orderId: match.orderId, transactionId: match.transactionId, amount: match.fee!, statementRow: match.row, reference: match.reference,
                });
                if (inserted) feesRecorded += 1;
            }
            await auditFromContext(c, {
                action: 'PESAPAL_STATEMENT_IMPORTED',
                entityType: 'payments',
                entityId: 'pesapal_statement',
                metadata: { file: file.name, rows: statementRows.length, matched: matches.length, fees_recorded: feesRecorded, issues: issues.length, missing: missing.length },
            });
        }

        const report: StatementReconciliationReport = {
            columns: { ...columns },
            rows: statementRows.length,
            matched: matches.length,
            fees_found: withFees.length,
            fees_total: roundMoney(withFees.reduce((sum, m) => sum + (m.fee ?? 0), 0)),
            recorded: recordFees,
            fees_recorded: feesRecorded,
            issues,
            missing_from_statement: missing,
            date_range: dateRange,
        };
        return success(c, report, recordFees ? `Recorded ${feesRecorded} fee(s)` : 'Statement checked (preview)');
    },
};
