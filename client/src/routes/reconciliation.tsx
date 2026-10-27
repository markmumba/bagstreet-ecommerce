import { createFileRoute, Link } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Scale, Upload } from 'lucide-react';
import type { ReconciliationIssueKind, StatementIssueResponse, StatementReconciliationReport } from 'shared';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useImportStatement, useReconciliationReport } from '@/hooks/useReconciliation';
import { formatDate, formatMoney, nairobiDay } from '@/lib/format';
import { ErrorNotice, errorMessage } from '@/components/ui/notice';
import { useListParams } from '@/hooks/useListParams';

export const Route = createFileRoute('/reconciliation')({
  component: ReconciliationPage,
});

const kes = (n: number) => formatMoney(n);
// The Nairobi day, so the range is right just after midnight too.
const isoDay = (d: Date) => nairobiDay(d);

const ISSUE_LABELS: Record<ReconciliationIssueKind, { label: string; variant: React.ComponentProps<typeof Badge>['variant'] }> = {
  refund_owed: { label: 'Refund owed', variant: 'danger' },
  held_for_review: { label: 'Held for review', variant: 'warning' },
  completed_payment_without_capture: { label: 'Missing from ledger', variant: 'danger' },
  paid_without_capture: { label: 'No payment record', variant: 'warning' },
  amount_mismatch: { label: 'Amount differs', variant: 'warning' },
  marked_paid_manually: { label: 'Marked paid by hand', variant: 'info' },
  payment_reversed: { label: 'Payment reversed', variant: 'danger' },
};

const STATEMENT_ISSUE_LABELS: Record<StatementIssueResponse['kind'], string> = {
  not_in_ledger: 'Not in ledger',
  amount_mismatch: 'Amount differs',
  unknown_reference: 'Unknown reference',
  not_successful: 'Not completed',
  unreadable_amount: 'Unreadable amount',
};

const COLUMN_LABELS: Record<string, string> = {
  tracking: 'Tracking ID',
  merchantReference: 'Merchant reference',
  confirmationCode: 'Confirmation code',
  amount: 'Amount',
  fee: 'Fee',
  date: 'Date',
  status: 'Status',
};

function ReconciliationPage() {
  // The date range lives in the URL (last 30 days by default).
  const today = new Date();
  const list = useListParams({ from: isoDay(new Date(today.getTime() - 29 * 86_400_000)), to: isoDay(today) });
  const from = String(list.params.from);
  const to = String(list.params.to);
  const setFrom = (value: string) => list.update({ from: value });
  const setTo = (value: string) => list.update({ to: value });
  const { data: report, isLoading, isFetching, isError, error } = useReconciliationReport(from, to);

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold leading-tight">
              <Scale className="h-6 w-6 text-muted-foreground" strokeWidth={1.7} />
              Reconciliation
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Check that orders, M-Pesa and your payment records agree.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-xs font-medium">
              From
              <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              To
              <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
        </div>

        {isError && (
          <ErrorNotice>
            {errorMessage(error, 'The report couldn’t be loaded. Check your connection, then change the dates or refresh the page.')}
          </ErrorNotice>
        )}

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['Received', report?.totals.captured],
            ['Refunded', report?.totals.refunded],
            ['Reversed', report?.totals.reversed],
            ['M-Pesa charges', report?.totals.fees],
            ['Net', report?.totals.net],
            ['Net after fees', report?.totals.net_after_fees],
          ].map(([label, value]) => (
            <Card key={label as string}>
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">{label}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {isLoading || value == null ? '—' : kes(value as number)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg" aria-live="polite">
              {report && report.issues.length === 0
                ? <CheckCircle2 className="h-5 w-5 text-[var(--color-success-text)]" strokeWidth={1.7} />
                : <AlertTriangle className="h-5 w-5 text-muted-foreground" strokeWidth={1.7} />}
              {isLoading || isFetching ? 'Checking…' : report?.issues.length ? `${report.issues.length} thing${report.issues.length === 1 ? '' : 's'} to look at` : 'Everything adds up'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {report && report.issues.length > 0 && (
              <div className="divide-y rounded-xl border text-sm">
                {report.issues.map((issue, i) => (
                  <div key={`${issue.order_id}-${issue.kind}-${i}`} className="flex flex-wrap items-start justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          to="/orders"
                          search={{ order_id: issue.order_id }}
                          className="font-mono text-xs underline-offset-2 hover:underline"
                        >
                          {issue.order_number ?? `#${issue.order_id}`}
                        </Link>
                        <Badge variant={ISSUE_LABELS[issue.kind].variant}>{ISSUE_LABELS[issue.kind].label}</Badge>
                      </div>
                      <p className="mt-1 text-muted-foreground">{issue.message}</p>
                    </div>
                    {issue.amount != null && <span className="shrink-0 tabular-nums font-medium">{kes(issue.amount)}</span>}
                  </div>
                ))}
              </div>
            )}
            {report && report.issues.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Every order with payment activity between {formatDate(report.from)} and {formatDate(report.to)} matches its M-Pesa and ledger records.
              </p>
            )}
          </CardContent>
        </Card>

        <StatementImport />
      </div>
    </DashboardLayout>
  );
}

function StatementImport() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<StatementReconciliationReport | null>(null);
  const [message, setMessage] = useState('');
  const importStatement = useImportStatement();

  const run = async (recordFees: boolean) => {
    if (!file) return;
    setMessage('');
    try {
      const res = await importStatement.mutateAsync({ file, recordFees });
      setResult(res.data ?? null);
      setMessage(res.message ?? '');
    } catch (err: any) {
      setResult(null);
      setMessage(errorMessage(err, 'The statement couldn’t be read. Check it’s the CSV export from the M-Pesa org portal and try again.'));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileSpreadsheet className="h-5 w-5 text-muted-foreground" strokeWidth={1.7} />
          M-Pesa statement
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Export your transactions as CSV from the M-Pesa org portal and upload them here. You'll see a
          preview first — fees are only recorded when you confirm, and importing the same statement twice is safe.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
              setMessage('');
            }}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" />
            {file ? 'Choose another file' : 'Choose CSV'}
          </Button>
          {file && <span className="min-w-0 max-w-full truncate text-sm text-muted-foreground">{file.name}</span>}
          <Button onClick={() => run(false)} disabled={!file || importStatement.isPending}>
            {importStatement.isPending && !importStatement.variables?.recordFees ? 'Checking…' : 'Check statement'}
          </Button>
        </div>

        {message && (result ? (
          <p role="status" className="rounded-xl bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{message}</p>
        ) : (
          <ErrorNotice>{message}</ErrorNotice>
        ))}

        {result && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                ['Rows', String(result.rows)],
                ['Matched', String(result.matched)],
                ['Fees found', `${result.fees_found} · ${kes(result.fees_total)}`],
                ['Statement dates', result.date_range ? `${formatDate(result.date_range.from)} → ${formatDate(result.date_range.to)}` : 'Unreadable'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-0.5 text-sm font-medium">{value}</p>
                </div>
              ))}
            </div>

            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Columns used from your file</summary>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {Object.entries(result.columns).map(([key, column]) => (
                  <li key={key}>{COLUMN_LABELS[key] ?? key}: <span className="font-mono">{column ?? '— not found'}</span></li>
                ))}
              </ul>
            </details>

            {result.issues.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">Statement rows to check ({result.issues.length})</h3>
                <div className="divide-y rounded-xl border text-sm">
                  {result.issues.map((issue) => (
                    <div key={`${issue.row}-${issue.kind}`} className="flex flex-wrap items-start justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">
                          Row {issue.row} · <span className="font-mono">{issue.reference ?? '—'}</span>
                          {issue.order_id && (
                            <> · <OrderLink id={issue.order_id}>{issue.order_number ?? `#${issue.order_id}`}</OrderLink></>
                          )}
                        </p>
                        <p><Badge variant="warning" className="mr-2">{STATEMENT_ISSUE_LABELS[issue.kind]}</Badge>{issue.message}</p>
                      </div>
                      {issue.statement_amount != null && <span className="tabular-nums">{kes(issue.statement_amount)}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.missing_from_statement.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">Recorded by Bagstreet but not on the statement ({result.missing_from_statement.length})</h3>
                <div className="divide-y rounded-xl border text-sm">
                  {result.missing_from_statement.map((m, i) => (
                    <div key={`${m.reference}-${i}`} className="flex justify-between gap-3 px-3 py-2">
                      <span className="min-w-0">
                        <OrderLink id={m.order_id} className="font-mono text-xs">{m.order_number ?? `#${m.order_id}`}</OrderLink> · {m.reference}
                      </span>
                      <span className="tabular-nums">{kes(m.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!result.recorded && result.fees_found > 0 && (
              <Button onClick={() => run(true)} disabled={importStatement.isPending}>
                {importStatement.isPending && importStatement.variables?.recordFees ? 'Recording…' : `Record ${result.fees_found} fee${result.fees_found === 1 ? '' : 's'} (${kes(result.fees_total)})`}
              </Button>
            )}
            {result.recorded && (
              <p role="status" className="text-sm text-[var(--color-success-text)]">
                {result.fees_recorded} new fee{result.fees_recorded === 1 ? '' : 's'} recorded
                {result.fees_recorded < result.fees_found ? ` (${result.fees_found - result.fees_recorded} were already recorded)` : ''}.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** An order number that opens the order in the orders page. */
function OrderLink({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) {
  return (
    <Link to="/orders" search={{ order_id: id }} className={cn('font-mono underline-offset-2 hover:underline', className)}>
      {children}
    </Link>
  );
}
