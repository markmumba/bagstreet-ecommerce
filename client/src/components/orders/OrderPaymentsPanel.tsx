import { useState } from 'react';
import { REFUND_METHOD } from 'shared';
import type { LedgerEntryResponse, OrderPaymentState, RefundMethod } from 'shared';
import { ArrowDownLeft, ArrowUpRight, Undo2 } from 'lucide-react';
import { useOrderPayments, useRecordRefund } from '@/hooks/useOrders';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const STATE_LABELS: Record<OrderPaymentState, { label: string; variant: React.ComponentProps<typeof Badge>['variant'] }> = {
  unpaid: { label: 'Unpaid', variant: 'neutral' },
  paid: { label: 'Paid', variant: 'success' },
  partially_refunded: { label: 'Partially refunded', variant: 'info' },
  refunded: { label: 'Refunded', variant: 'neutral' },
  refund_owed: { label: 'Refund owed', variant: 'danger' },
  underpaid: { label: 'Underpaid', variant: 'warning' },
  overpaid: { label: 'Overpaid', variant: 'warning' },
  reversed: { label: 'Reversed', variant: 'danger' },
};

const METHOD_LABELS: Record<RefundMethod, string> = {
  MPESA: 'M-Pesa',
  PESAPAL: 'Pesapal',
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank transfer',
  OTHER: 'Other',
};

const kes = (amount: number) => `KES ${amount.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function entryLabel(entry: LedgerEntryResponse) {
  if (entry.entry_type === 'PAYMENT_CAPTURED') {
    const method = entry.metadata?.payment_method ?? entry.metadata?.provider;
    return method ? `Payment received · ${String(method)}` : 'Payment received';
  }
  if (entry.entry_type === 'PROVIDER_FEE') return 'Pesapal fee';
  if (entry.entry_type === 'PAYMENT_REVERSED') return 'Taken back by the payment provider';
  if (entry.entry_type === 'REFUND_ISSUED') {
    const method = entry.metadata?.method as RefundMethod | undefined;
    return `Refund${method ? ` · ${METHOD_LABELS[method] ?? method}` : ''}`;
  }
  return entry.entry_type.replace(/_/g, ' ').toLowerCase();
}

/** Ledger-backed money view of an order, with the admin "Record refund" action. */
export function OrderPaymentsPanel({ orderId, canRefund }: { orderId: string; canRefund: boolean }) {
  const { data, isLoading, isError } = useOrderPayments(orderId);
  const [formOpen, setFormOpen] = useState(false);
  const payments = data?.data;

  if (isLoading) return <div className="h-24 animate-pulse rounded-xl bg-muted/40" />;
  if (isError || !payments) {
    return <p className="text-sm text-muted-foreground">Payment history couldn't be loaded.</p>;
  }

  const { summary, entries } = payments;
  const state = STATE_LABELS[summary.state];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Payments</h3>
        <Badge variant={state.variant}>{state.label}</Badge>
      </div>

      <dl className="grid grid-cols-3 gap-2 rounded-xl border p-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Received</dt>
          <dd className="font-medium tabular-nums">{kes(summary.captured)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{summary.reversed > 0 ? 'Refunded / reversed' : 'Refunded'}</dt>
          <dd className="font-medium tabular-nums">{kes(summary.refunded + summary.reversed)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Net kept</dt>
          <dd className="font-semibold tabular-nums">{kes(summary.net)}</dd>
        </div>
      </dl>
      {summary.fees > 0 && (
        <p className="-mt-1 text-xs text-muted-foreground">
          After {kes(summary.fees)} Pesapal fees: <span className="font-medium text-foreground">{kes(summary.net_after_fees)}</span>
        </p>
      )}

      {summary.state === 'refund_owed' && (
        <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          This order is cancelled but {kes(summary.net)} is still held. Send the money back, then record the refund here.
        </p>
      )}
      {(summary.state === 'underpaid' || summary.state === 'overpaid') && (
        <p className="rounded-xl bg-[var(--color-warning-bg)] px-3 py-2 text-sm text-[var(--color-warning-text)]">
          Received {kes(summary.captured)} against an order total of {kes(summary.order_total)}. Check with Pesapal before fulfilling.
        </p>
      )}
      {summary.legacy_unrecorded_capture && (
        <p className="text-xs text-muted-foreground">
          Paid before payment history was recorded — the order total is assumed to have been received.
        </p>
      )}

      {entries.length > 0 && (
        <ol className="divide-y rounded-xl border text-sm">
          {entries.map((entry) => {
            const isRefund = entry.entry_type === 'REFUND_ISSUED' || entry.entry_type === 'PAYMENT_REVERSED';
            const isFee = entry.entry_type === 'PROVIDER_FEE';
            const reason = entry.metadata?.reason as string | undefined;
            const externalRef = (entry.metadata?.external_reference ?? entry.metadata?.provider_reference) as string | undefined;
            return (
              <li key={entry.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                <div className="flex min-w-0 gap-2">
                  {isRefund || isFee
                    ? <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-destructive" strokeWidth={1.8} aria-hidden="true" />
                    : <ArrowDownLeft className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-success-text)]" strokeWidth={1.8} aria-hidden="true" />}
                  <div className="min-w-0">
                    <p className="font-medium first-letter:uppercase">{entryLabel(entry)}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(entry.created_at).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}
                      {externalRef ? ` · ${externalRef}` : ''}
                    </p>
                    {reason && <p className="mt-0.5 text-xs text-muted-foreground">“{reason}”</p>}
                  </div>
                </div>
                <span className={`shrink-0 tabular-nums font-medium ${isRefund ? 'text-destructive' : isFee ? 'text-muted-foreground' : ''}`}>
                  {entry.direction === 'DEBIT' ? '−' : '+'}{kes(entry.amount)}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {canRefund && summary.refundable > 0 && !formOpen && (
        <Button variant="outline" size="sm" className="self-start" onClick={() => setFormOpen(true)}>
          <Undo2 className="h-4 w-4" />
          Record refund
        </Button>
      )}
      {canRefund && formOpen && (
        <RefundForm orderId={orderId} refundable={summary.refundable} onDone={() => setFormOpen(false)} />
      )}
    </div>
  );
}

function RefundForm({ orderId, refundable, onDone }: { orderId: string; refundable: number; onDone: () => void }) {
  const recordRefund = useRecordRefund();
  // One key per form: a double click or retry after a timeout records the refund once.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState(String(refundable));
  const [method, setMethod] = useState<RefundMethod>(REFUND_METHOD.MPESA);
  const [externalReference, setExternalReference] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const numericAmount = Number(amount);
  const amountValid = Number.isFinite(numericAmount) && numericAmount > 0 && numericAmount <= refundable;
  const canSubmit = amountValid && reason.trim().length >= 3 && !recordRefund.isPending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await recordRefund.mutateAsync({
        id: orderId,
        data: {
          amount: Math.round(numericAmount * 100) / 100,
          method,
          external_reference: externalReference.trim() || undefined,
          reason: reason.trim(),
          idempotency_key: idempotencyKey,
        },
      });
      onDone();
    } catch (err: any) {
      setError(err?.message || 'Could not record the refund');
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">
        Record money you have <span className="font-medium text-foreground">already sent back</span> to the customer.
        Up to {kes(refundable)} can be refunded.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium">
          Amount (KES)
          <Input
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            max={refundable}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={!amountValid}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Method
          <Select value={method} onValueChange={(v) => setMethod(v as RefundMethod)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.values(REFUND_METHOD).map((m) => (
                <SelectItem key={m} value={m}>{METHOD_LABELS[m]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setAmount(String(refundable))}>Full amount</Button>
      </div>

      <label className="flex flex-col gap-1 text-xs font-medium">
        Transaction code (optional)
        <Input
          value={externalReference}
          onChange={(e) => setExternalReference(e.target.value.toUpperCase())}
          placeholder="e.g. M-Pesa code SJK3XXXXXX"
          maxLength={100}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium">
        Reason
        <Textarea
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Returned within 24 hours, unused"
          maxLength={500}
        />
      </label>

      {!amountValid && amount !== '' && (
        <p className="text-xs text-destructive">Enter an amount between KES 0.01 and {kes(refundable)}.</p>
      )}
      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={recordRefund.isPending}>Cancel</Button>
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {recordRefund.isPending ? 'Recording…' : `Record ${amountValid ? kes(numericAmount) : ''} refund`}
        </Button>
      </div>
    </form>
  );
}
