import { useState } from 'react';
import type { GiftVoucherMovementKind, IssuedGiftVoucherResponse } from 'shared';
import { IssuedVoucherDialog } from './IssuedVoucherDialog';
import { useAdjustGiftVoucher, useGiftVoucher, useReplaceGiftVoucherCode, useVoidGiftVoucher } from '@/hooks/useGiftVouchers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorNotice, errorMessage } from '@/components/ui/notice';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { SALE_METHOD_LABELS, STATUS_LABELS, formatDate, kes } from './voucher-format';
import { formatDateTime } from '@/lib/format';

const MOVEMENT_LABELS: Record<GiftVoucherMovementKind, string> = {
  ISSUED: 'Issued',
  HELD: 'Held for an order',
  REDEEMED: 'Spent on an order',
  RELEASED: 'Hold released',
  RETURNED: 'Given back',
  VOIDED: 'Cancelled',
  ADJUSTED: 'Balance corrected',
  CODE_REPLACED: 'New code issued',
};

/** A voucher's details and every change to its balance; admins can cancel it or correct the balance. */
export function VoucherSheet({ voucherId, isAdmin, onClose }: { voucherId: string | null; isAdmin: boolean; onClose: () => void }) {
  const { data: voucher, isLoading } = useGiftVoucher(voucherId);
  const [action, setAction] = useState<'void' | 'adjust' | 'replace' | null>(null);
  const replaceCode = useReplaceGiftVoucherCode();
  const [newCode, setNewCode] = useState<IssuedGiftVoucherResponse | null>(null);
  const [replaceError, setReplaceError] = useState('');
  const confirmReplace = async () => {
    if (!voucherId) return;
    setReplaceError('');
    try {
      setNewCode(await replaceCode.mutateAsync(voucherId));
      setAction(null);
    } catch (err: any) {
      setReplaceError(errorMessage(err, 'A new code couldn’t be issued. Check your connection and try again.'));
    }
  };

  return (
    <Sheet open={Boolean(voucherId)} onOpenChange={(open) => { if (!open) { setAction(null); onClose(); } }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="pb-4">
          <SheetTitle>Gift voucher ····{voucher?.code_last4 ?? ''}</SheetTitle>
          <SheetDescription>{voucher ? `Issued ${formatDate(voucher.created_at)}` : 'Loading…'}</SheetDescription>
        </SheetHeader>
        {isLoading || !voucher ? (
          <div className="mx-4 h-32 animate-pulse rounded-xl bg-muted/40" />
        ) : (
          <div className="flex flex-col gap-5 px-4 pb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-semibold tabular-nums">{kes(voucher.balance)}</p>
                <p className="text-sm text-muted-foreground">left of {kes(voucher.initial_amount)}</p>
              </div>
              <Badge variant={STATUS_LABELS[voucher.status].variant}>{STATUS_LABELS[voucher.status].label}</Badge>
            </div>
            {voucher.held > 0 && (
              <p className="rounded-xl bg-[var(--color-warning-bg)] px-3 py-2 text-sm text-[var(--color-warning-text)]">
                {kes(voucher.held)} is held for an unpaid order. It is spent when the order is paid, or comes back if it expires.
              </p>
            )}
            <dl className="grid grid-cols-2 gap-3 rounded-xl border p-3 text-sm">
              <div><dt className="text-xs text-muted-foreground">Valid until</dt><dd>{formatDate(voucher.expires_at)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">{voucher.sold_via === 'ONLINE' ? 'Bought online' : 'Paid by'}</dt>
                <dd>{voucher.sold_via === 'ONLINE'
                  ? `Pesapal · order ${voucher.purchase_order_number ?? voucher.sale_reference ?? ''}`
                  : `${SALE_METHOD_LABELS[voucher.sale_payment_method] ?? voucher.sale_payment_method}${voucher.sale_reference ? ` · ${voucher.sale_reference}` : ''}`}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Bought by</dt><dd>{voucher.purchaser_name || '—'}</dd></div>
              <div><dt className="text-xs text-muted-foreground">For</dt><dd>{voucher.recipient_name || '—'}</dd></div>
              {(voucher.recipient_phone || voucher.recipient_email) && (
                <div className="col-span-2"><dt className="text-xs text-muted-foreground">Contact</dt>
                  <dd className="break-all">{[voucher.recipient_phone, voucher.recipient_email].filter(Boolean).join(' · ')}</dd></div>
              )}
              {voucher.message && <div className="col-span-2"><dt className="text-xs text-muted-foreground">Message</dt><dd>“{voucher.message}”</dd></div>}
              {voucher.sold_via !== 'ONLINE' && (
                <div className="col-span-2"><dt className="text-xs text-muted-foreground">Issued by</dt><dd>{voucher.issued_by_email ?? '—'}</dd></div>
              )}
              {voucher.voided_at && (
                <div className="col-span-2"><dt className="text-xs text-muted-foreground">Cancelled</dt>
                  <dd>{formatDate(voucher.voided_at)}{voucher.void_reason ? ` · ${voucher.void_reason}` : ''}</dd></div>
              )}
            </dl>

            {isAdmin && !voucher.voided_at && !action && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setAction('replace')}>New code</Button>
                <Button variant="outline" size="sm" onClick={() => setAction('adjust')}>Correct balance</Button>
                <Button variant="outline" size="sm" className="text-destructive" onClick={() => setAction('void')}>Cancel voucher</Button>
              </div>
            )}
            {action === 'replace' && (
              <div className="flex flex-col gap-2 rounded-xl border bg-muted/20 p-3">
                <p className="text-sm">For a lost or exposed code: the voucher keeps its balance and expiry, the old code stops working, and the new one is shown once.</p>
                <ErrorNotice>{replaceError}</ErrorNotice>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setAction(null)}>Cancel</Button>
                  <Button size="sm" onClick={confirmReplace} disabled={replaceCode.isPending}>{replaceCode.isPending ? 'Issuing…' : 'Issue new code'}</Button>
                </div>
              </div>
            )}
            {action === 'void' && <VoidForm id={voucher.id} balance={voucher.balance} onDone={() => setAction(null)} />}
            {action === 'adjust' && <AdjustForm id={voucher.id} balance={voucher.balance} onDone={() => setAction(null)} />}

            <div>
              <h3 className="mb-2 text-sm font-semibold">History</h3>
              <ol className="divide-y rounded-xl border text-sm">
                {voucher.movements.map((m) => (
                  <li key={m.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="font-medium">{MOVEMENT_LABELS[m.kind]}{m.order_number ? ` · ${m.order_number}` : ''}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(m.created_at)}
                        {m.created_by_email ? ` · ${m.created_by_email}` : ''}
                      </p>
                      {m.note && <p className="mt-0.5 text-xs text-muted-foreground">{m.note}</p>}
                    </div>
                    <div className="shrink-0 text-right tabular-nums">
                      <p className={m.delta < 0 ? 'text-destructive' : m.delta > 0 ? 'text-[var(--color-success-text)]' : 'text-muted-foreground'}>
                        {m.delta === 0 ? kes(m.amount) : `${m.delta > 0 ? '+' : '−'}${kes(Math.abs(m.delta))}`}
                      </p>
                      <p className="text-xs text-muted-foreground">{kes(m.balance_after)} left</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </SheetContent>
      <IssuedVoucherDialog voucher={newCode} replaced onClose={() => setNewCode(null)} />
    </Sheet>
  );
}

function VoidForm({ id, balance, onDone }: { id: string; balance: number; onDone: () => void }) {
  const voidVoucher = useVoidGiftVoucher();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await voidVoucher.mutateAsync({ id, reason: reason.trim() });
      onDone();
    } catch (err: any) {
      setError(errorMessage(err, 'The voucher couldn’t be cancelled. Check your connection and try again.'));
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
      <p className="text-sm">Cancelling removes the {kes(balance)} balance for good. Use it for a lost or misused code.</p>
      <Label htmlFor="void-voucher-reason">Why it’s being cancelled</Label>
      <Input id="void-voucher-reason" value={reason} onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. code shared publicly…" maxLength={300} aria-describedby="void-voucher-reason-hint" />
      <p id="void-voucher-reason-hint" className="text-xs text-muted-foreground">Required, at least 3 characters.</p>
      <ErrorNotice>{error}</ErrorNotice>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>Keep it</Button>
        <Button type="submit" variant="destructive" size="sm" disabled={reason.trim().length < 3 || voidVoucher.isPending}>{voidVoucher.isPending ? 'Cancelling…' : 'Cancel voucher'}</Button>
      </div>
    </form>
  );
}

function AdjustForm({ id, balance, onDone }: { id: string; balance: number; onDone: () => void }) {
  const adjust = useAdjustGiftVoucher();
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const amount = Number(delta);
  const valid = Number.isFinite(amount) && amount !== 0 && balance + amount >= 0;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await adjust.mutateAsync({ id, delta: amount, reason: reason.trim() });
      onDone();
    } catch (err: any) {
      setError(errorMessage(err, 'The balance couldn’t be changed. Check your connection and try again.'));
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-xl border bg-muted/20 p-3">
      <p id="adjust-voucher-hint" className="text-xs text-muted-foreground">Add (e.g. 500) or take off (e.g. -500). The reason goes in the history and the audit log.</p>
      <div className="grid grid-cols-2 items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="adjust-voucher-amount">Amount (KES)</Label>
          <Input id="adjust-voucher-amount" type="number" inputMode="decimal" value={delta} onChange={(e) => setDelta(e.target.value)}
            placeholder="e.g. 500" aria-describedby="adjust-voucher-hint" />
        </div>
        <p className="pb-2 text-sm tabular-nums text-muted-foreground" aria-live="polite">New balance: {valid ? kes(balance + amount) : '—'}</p>
      </div>
      <Label htmlFor="adjust-voucher-reason">Why it’s being corrected</Label>
      <Input id="adjust-voucher-reason" value={reason} onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. counted twice at the till…" maxLength={300} aria-describedby="adjust-voucher-reason-hint" />
      <p id="adjust-voucher-reason-hint" className="text-xs text-muted-foreground">Required, at least 3 characters.</p>
      <ErrorNotice>{error}</ErrorNotice>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>Cancel</Button>
        <Button type="submit" size="sm" disabled={!valid || reason.trim().length < 3 || adjust.isPending}>{adjust.isPending ? 'Saving…' : 'Save'}</Button>
      </div>
    </form>
  );
}
