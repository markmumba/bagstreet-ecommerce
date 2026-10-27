import { useState } from 'react';
import { Search } from 'lucide-react';
import { useLookupGiftVoucher } from '@/hooks/useGiftVouchers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorNotice, errorMessage } from '@/components/ui/notice';
import { STATUS_LABELS, formatDate, kes } from './voucher-format';

/** For a customer at the counter asking what's left on their voucher. */
export function CheckBalanceCard({ onOpen }: { onOpen: (id: string) => void }) {
  const lookup = useLookupGiftVoucher();
  const [code, setCode] = useState('');
  const [missingCode, setMissingCode] = useState(false);
  const voucher = lookup.data;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!code.trim()) {
      lookup.reset();
      setMissingCode(true);
      return;
    }
    setMissingCode(false);
    lookup.mutate(code.trim());
  };

  return (
    <form onSubmit={submit} className="rounded-xl border bg-card p-4">
      <h2 className="text-sm font-semibold">Check a voucher</h2>
      <Label htmlFor="check-voucher-code" className="mt-3 block text-xs text-muted-foreground">Voucher code</Label>
      <div className="mt-1.5 flex gap-2">
        <Input id="check-voucher-code" value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setMissingCode(false); }}
          placeholder="BGST-XXXX-XXXX-XXXX-XXXX…" className="font-mono" maxLength={40}
          autoComplete="off" spellCheck={false} aria-invalid={missingCode || undefined} />
        <Button type="submit" variant="outline" disabled={lookup.isPending}>
          <Search className="h-4 w-4" />
          Check
        </Button>
      </div>
      {missingCode && <ErrorNotice className="mt-3">Type the code from the voucher card, then press Check.</ErrorNotice>}
      {lookup.isError && (
        <ErrorNotice className="mt-3">
          {(lookup.error as { status?: number })?.status === 404
            ? 'No voucher has that code. Check each character against the card and try again.'
            : errorMessage(lookup.error, 'The voucher couldn’t be checked. Check your connection and try again.')}
        </ErrorNotice>
      )}
      {voucher && !lookup.isError && (
        <button type="button" onClick={() => onOpen(voucher.id)}
          className="mt-3 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted/40">
          <span>
            <span className="font-semibold">{kes(voucher.balance)}</span> left of {kes(voucher.initial_amount)}
            <span className="block text-xs text-muted-foreground">
              ····{voucher.code_last4} · valid until {formatDate(voucher.expires_at)}
              {voucher.held > 0 ? ` · ${kes(voucher.held)} held for an unpaid order` : ''}
            </span>
          </span>
          <Badge variant={STATUS_LABELS[voucher.status].variant}>{STATUS_LABELS[voucher.status].label}</Badge>
        </button>
      )}
    </form>
  );
}
