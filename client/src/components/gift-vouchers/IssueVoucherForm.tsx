import { useState } from 'react';
import { VOUCHER_SALE_PAYMENT_METHOD, type IssuedGiftVoucherResponse, type VoucherSalePaymentMethod } from 'shared';
import { useIssueGiftVoucher } from '@/hooks/useGiftVouchers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SALE_METHOD_LABELS, kes } from './voucher-format';

const QUICK_AMOUNTS = [2000, 5000, 10000, 20000];
const EMPTY = { amount: '', method: VOUCHER_SALE_PAYMENT_METHOD.CASH as VoucherSalePaymentMethod, reference: '', purchaser: '', recipient: '', phone: '', email: '', message: '' };

/** Selling a voucher at the till, once the customer has paid for it. */
export function IssueVoucherForm({ onIssued }: { onIssued: (voucher: IssuedGiftVoucherResponse) => void }) {
  const issue = useIssueGiftVoucher();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  const amount = Number(form.amount);
  const amountValid = Number.isInteger(amount) && amount >= 100 && amount <= 200_000;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      const voucher = await issue.mutateAsync({
        amount,
        sale_payment_method: form.method,
        sale_reference: form.reference.trim() || undefined,
        purchaser_name: form.purchaser.trim() || undefined,
        recipient_name: form.recipient.trim() || undefined,
        recipient_phone: form.phone.trim() || undefined,
        recipient_email: form.email.trim() || undefined,
        message: form.message.trim() || undefined,
      });
      setForm(EMPTY);
      onIssued(voucher);
    } catch (err: any) {
      setError(err?.message || 'Could not issue the voucher');
    }
  };

  return (
    <form onSubmit={submit} className="rounded-xl border bg-card p-4">
      <h2 className="text-sm font-semibold">Sell a gift voucher</h2>
      <p className="mt-1 text-xs text-muted-foreground">Take payment first, then issue it. Valid for 1 year.</p>
      <div className="mt-4 grid gap-3">
        <div className="space-y-2">
          <Label htmlFor="voucher-amount">Amount (KES)</Label>
          <Input id="voucher-amount" type="number" inputMode="numeric" min={100} max={200000} step={1}
            value={form.amount} onChange={set('amount')} placeholder="e.g. 5000" required />
          <div className="flex flex-wrap gap-2">
            {QUICK_AMOUNTS.map((value) => (
              <Button key={value} type="button" size="sm" variant={amount === value ? 'default' : 'outline'}
                onClick={() => setForm((f) => ({ ...f, amount: String(value) }))}>
                {kes(value)}
              </Button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="voucher-method">Paid by</Label>
            <Select value={form.method} onValueChange={(v) => setForm((f) => ({ ...f, method: v as VoucherSalePaymentMethod }))}>
              <SelectTrigger id="voucher-method"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.values(VOUCHER_SALE_PAYMENT_METHOD).map((m) => (
                  <SelectItem key={m} value={m}>{SALE_METHOD_LABELS[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="voucher-reference">Transaction code</Label>
            <Input id="voucher-reference" value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value.toUpperCase() }))}
              placeholder="Optional" maxLength={100} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="voucher-purchaser">Bought by</Label>
            <Input id="voucher-purchaser" value={form.purchaser} onChange={set('purchaser')} placeholder="Optional" maxLength={120} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="voucher-recipient">For</Label>
            <Input id="voucher-recipient" value={form.recipient} onChange={set('recipient')} placeholder="Optional" maxLength={120} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="voucher-phone">Their phone</Label>
            <Input id="voucher-phone" value={form.phone} onChange={set('phone')} placeholder="Optional" maxLength={30} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="voucher-email">Their email</Label>
            <Input id="voucher-email" type="email" value={form.email} onChange={set('email')} placeholder="Optional" maxLength={200} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="voucher-message">Message on the card</Label>
          <Textarea id="voucher-message" rows={2} value={form.message} onChange={set('message')} placeholder="Optional" maxLength={300} />
        </div>
        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={!amountValid || issue.isPending}>
          {issue.isPending ? 'Issuing…' : amountValid ? `Issue ${kes(amount)} voucher` : 'Issue voucher'}
        </Button>
      </div>
    </form>
  );
}
