import { useState } from 'react';
import { Search } from 'lucide-react';
import { useLookupGiftVoucher } from '@/hooks/useGiftVouchers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { STATUS_LABELS, formatDate, kes } from './voucher-format';

/** For a customer at the counter asking what's left on their voucher. */
export function CheckBalanceCard({ onOpen }: { onOpen: (id: string) => void }) {
  const lookup = useLookupGiftVoucher();
  const [code, setCode] = useState('');
  const voucher = lookup.data;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (code.trim()) lookup.mutate(code.trim());
  };

  return (
    <form onSubmit={submit} className="rounded-xl border bg-card p-4">
      <h2 className="text-sm font-semibold">Check a voucher</h2>
      <div className="mt-3 flex gap-2">
        <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="BGST-XXXX-XXXX-XXXX-XXXX"
          className="font-mono" maxLength={40} autoComplete="off" />
        <Button type="submit" variant="outline" disabled={!code.trim() || lookup.isPending}>
          <Search className="h-4 w-4" />
          Check
        </Button>
      </div>
      {lookup.isError && (
        <p className="mt-3 text-sm text-destructive">
          {(lookup.error as { status?: number })?.status === 404 ? 'No voucher has that code.' : (lookup.error as Error)?.message}
        </p>
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
