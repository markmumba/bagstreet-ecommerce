/**
 * Pesapal statement reconciliation — pure logic (no DB), unit-tested.
 *
 * The statement is the CSV export from the Pesapal merchant dashboard. Its exact column names
 * aren't fixed here: columns are found by header keywords, and the report says which column was
 * used for what, so a mismatch is visible rather than silently wrong.
 */
import type { CsvRow } from '@server/lib/csv-import';
import { roundMoney } from '@server/lib/pricing';

export interface StatementColumns {
    tracking: string | null;
    merchantReference: string | null;
    confirmationCode: string | null;
    amount: string | null;
    fee: string | null;
    date: string | null;
    status: string | null;
}

/** First header matching any include pattern and no exclude pattern. Headers are snake_case. */
function findColumn(headers: string[], include: RegExp[], exclude: RegExp[] = []) {
    for (const pattern of include) {
        const match = headers.find((h) => pattern.test(h) && !exclude.some((x) => x.test(h)));
        if (match) return match;
    }
    return null;
}

export function detectStatementColumns(headers: string[]): StatementColumns {
    return {
        tracking: findColumn(headers, [/tracking/]),
        merchantReference: findColumn(headers, [/merchant.*ref/, /order.*ref/, /^reference$/, /^merchant_reference$/]),
        confirmationCode: findColumn(headers, [/confirmation/, /receipt/, /transaction_code/, /mpesa.*code/, /payment.*ref/]),
        amount: findColumn(
            headers,
            [/^amount$/, /^gross/, /transaction_amount/, /paid_amount/, /amount_paid/, /amount/],
            [/fee/, /commission/, /charge/, /net/, /balance/, /settle/],
        ),
        fee: findColumn(headers, [/fee/, /commission/, /charges?$/]),
        date: findColumn(headers, [/date/, /time/, /created/]),
        status: findColumn(headers, [/status/]),
    };
}

/** Problems that make the statement unusable, in words an admin can act on. */
export function statementColumnProblems(columns: StatementColumns): string[] {
    const problems: string[] = [];
    if (!columns.amount) problems.push('No amount column found (looked for a header like "Amount").');
    if (!columns.tracking && !columns.merchantReference && !columns.confirmationCode) {
        problems.push('No reference column found (looked for "Tracking ID", "Merchant Reference" or "Confirmation Code").');
    }
    return problems;
}

/** "KES 1,234.50" → 1234.5; "(150.00)" → -150; blank or junk → null. */
export function parseMoney(raw: string | undefined): number | null {
    if (raw == null) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const negative = /^\(.*\)$/.test(trimmed) || trimmed.startsWith('-');
    const digits = trimmed.replace(/[^0-9.]/g, '');
    if (!digits || !/\d/.test(digits)) return null;
    const value = Number(digits);
    if (!Number.isFinite(value)) return null;
    return roundMoney(negative ? -value : value);
}

export interface StatementRow {
    rowNumber: number;
    references: string[];
    amount: number | null;
    fee: number | null;
    date: string | null;
    successful: boolean;
}

export function normaliseStatementRows(rows: CsvRow[], columns: StatementColumns): StatementRow[] {
    return rows.map((row) => {
        const get = (column: string | null) => (column ? (row.values[column] ?? '').trim() : '');
        const status = get(columns.status).toLowerCase();
        return {
            rowNumber: row.rowNumber,
            references: [get(columns.tracking), get(columns.merchantReference), get(columns.confirmationCode)].filter(Boolean),
            amount: parseMoney(get(columns.amount)),
            fee: columns.fee ? Math.abs(parseMoney(get(columns.fee)) ?? 0) || null : null,
            date: get(columns.date) || null,
            // No status column: assume the export lists completed payments only.
            successful: !columns.status || !status || /complet|success|paid|settled/.test(status),
        };
    });
}

/** A Pesapal transaction we know about, with what the ledger recorded for it. */
export interface KnownTransaction {
    transactionId: number;
    orderId: number;
    orderNumber: string | null;
    references: string[];
    capturedAmount: number;
}

export type StatementIssueKind = 'not_in_ledger' | 'amount_mismatch' | 'unknown_reference' | 'not_successful' | 'unreadable_amount';

export interface StatementIssue {
    row: number;
    kind: StatementIssueKind;
    reference: string | null;
    order_number: string | null;
    statement_amount: number | null;
    ledger_amount: number | null;
    message: string;
}

export interface StatementMatch {
    row: number;
    transactionId: number;
    orderId: number;
    reference: string;
    fee: number | null;
}

const TOLERANCE = 0.5;

/** Matches statement rows to known transactions and reports every difference. */
export function reconcileStatementRows(rows: StatementRow[], known: KnownTransaction[]) {
    const byReference = new Map<string, KnownTransaction>();
    for (const tx of known) for (const ref of tx.references) if (ref) byReference.set(ref.toUpperCase(), tx);

    const matches: StatementMatch[] = [];
    const issues: StatementIssue[] = [];
    const matchedTransactionIds = new Set<number>();

    for (const row of rows) {
        const reference = row.references[0] ?? null;
        if (!row.successful) {
            issues.push({ row: row.rowNumber, kind: 'not_successful', reference, order_number: null, statement_amount: row.amount, ledger_amount: null, message: 'Not a completed payment on the statement — skipped.' });
            continue;
        }
        if (row.amount == null) {
            issues.push({ row: row.rowNumber, kind: 'unreadable_amount', reference, order_number: null, statement_amount: null, ledger_amount: null, message: 'Amount could not be read.' });
            continue;
        }

        const tx = row.references.map((ref) => byReference.get(ref.toUpperCase())).find(Boolean);
        if (!tx) {
            issues.push({ row: row.rowNumber, kind: 'unknown_reference', reference, order_number: null, statement_amount: row.amount, ledger_amount: null, message: 'No Bagstreet payment has this reference.' });
            continue;
        }

        matchedTransactionIds.add(tx.transactionId);
        matches.push({ row: row.rowNumber, transactionId: tx.transactionId, orderId: tx.orderId, reference: reference ?? tx.references[0]!, fee: row.fee });

        if (tx.capturedAmount === 0) {
            issues.push({ row: row.rowNumber, kind: 'not_in_ledger', reference, order_number: tx.orderNumber, statement_amount: row.amount, ledger_amount: 0, message: 'Pesapal received this payment but the order has no payment recorded.' });
        } else if (Math.abs(tx.capturedAmount - row.amount) > TOLERANCE) {
            issues.push({ row: row.rowNumber, kind: 'amount_mismatch', reference, order_number: tx.orderNumber, statement_amount: row.amount, ledger_amount: tx.capturedAmount, message: `Statement shows KES ${row.amount.toFixed(2)}, ledger recorded KES ${tx.capturedAmount.toFixed(2)}.` });
        }
    }

    return { matches, issues, matchedTransactionIds };
}
