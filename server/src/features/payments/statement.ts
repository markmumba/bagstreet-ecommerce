/**
 * Paystack statement reconciliation — pure logic (no DB), unit-tested.
 *
 * The statement is the transactions CSV export from the Paystack dashboard. Its columns can be
 * customised there, so they aren't fixed here: columns are found by header keywords, and the
 * report says which column was used for what, so a mismatch is visible rather than silently wrong.
 * Our charge reference (e.g. BS-0F5C1D15-mwkfzng8) is Paystack's "Reference".
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
            [/^paid_in$/, /^amount$/, /^gross/, /transaction_amount/, /paid_amount/, /amount_paid/, /amount/],
            [/fee/, /commission/, /charge/, /net/, /balance/, /settle/],
        ),
        fee: findColumn(headers, [/fee/, /commission/, /charges?$/]),
        date: findColumn(headers, [/^paid_at$/, /date/, /time/, /created/, /_at$/]),
        // The transaction's own status, not a settlement or payout status.
        status: findColumn(headers, [/^status$/, /transaction_status/, /status/], [/settle/, /payout/, /transfer/]),
    };
}

/** Problems that make the statement unusable, in words an admin can act on. */
export function statementColumnProblems(columns: StatementColumns): string[] {
    const problems: string[] = [];
    if (!columns.amount) problems.push('No amount column found (looked for a header like "Amount").');
    if (!columns.tracking && !columns.merchantReference && !columns.confirmationCode) {
        problems.push('No reference column found (looked for "Reference"). Include it when exporting from Paystack.');
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
    /** Paystack lists payments reversed after succeeding in its "successful" export. */
    reversed: boolean;
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
            reversed: /revers/.test(status),
        };
    });
}

/** A Paystack transaction we know about, with what the ledger recorded for it. */
export interface KnownTransaction {
    transactionId: number;
    orderId: number;
    orderNumber: string | null;
    references: string[];
    capturedAmount: number;
}

export type StatementIssueKind = 'not_in_ledger' | 'amount_mismatch' | 'unknown_reference' | 'not_successful' | 'reversed' | 'unreadable_amount';

export interface StatementIssue {
    row: number;
    kind: StatementIssueKind;
    reference: string | null;
    /** The order the row belongs to, when the reference matched one (for linking to it). */
    order_id: string | null;
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
        const tx = row.references.map((ref) => byReference.get(ref.toUpperCase())).find(Boolean);
        if (row.reversed) {
            issues.push({
                row: row.rowNumber, kind: 'reversed', reference,
                order_id: tx ? String(tx.orderId) : null, order_number: tx?.orderNumber ?? null,
                statement_amount: row.amount, ledger_amount: tx?.capturedAmount ?? null,
                message: tx && tx.capturedAmount > 0
                    ? 'Paystack reversed this payment, but the order still has it recorded as received. Check the order.'
                    : 'Paystack reversed this payment.',
            });
            continue;
        }
        if (!row.successful) {
            issues.push({ row: row.rowNumber, kind: 'not_successful', reference, order_id: null, order_number: null, statement_amount: row.amount, ledger_amount: null, message: 'Not a completed payment on the statement — skipped.' });
            continue;
        }
        if (row.amount == null) {
            issues.push({ row: row.rowNumber, kind: 'unreadable_amount', reference, order_id: null, order_number: null, statement_amount: null, ledger_amount: null, message: 'Amount could not be read.' });
            continue;
        }

        if (!tx) {
            issues.push({ row: row.rowNumber, kind: 'unknown_reference', reference, order_id: null, order_number: null, statement_amount: row.amount, ledger_amount: null, message: 'No Bagstreet payment has this reference.' });
            continue;
        }

        matchedTransactionIds.add(tx.transactionId);
        matches.push({ row: row.rowNumber, transactionId: tx.transactionId, orderId: tx.orderId, reference: reference ?? tx.references[0]!, fee: row.fee });

        if (tx.capturedAmount === 0) {
            issues.push({ row: row.rowNumber, kind: 'not_in_ledger', reference, order_id: String(tx.orderId), order_number: tx.orderNumber, statement_amount: row.amount, ledger_amount: 0, message: 'Paystack received this payment but the order has no payment recorded.' });
        } else if (Math.abs(tx.capturedAmount - row.amount) > TOLERANCE) {
            issues.push({ row: row.rowNumber, kind: 'amount_mismatch', reference, order_id: String(tx.orderId), order_number: tx.orderNumber, statement_amount: row.amount, ledger_amount: tx.capturedAmount, message: `Statement shows KES ${row.amount.toFixed(2)}, ledger recorded KES ${tx.capturedAmount.toFixed(2)}.` });
        }
    }

    return { matches, issues, matchedTransactionIds };
}
