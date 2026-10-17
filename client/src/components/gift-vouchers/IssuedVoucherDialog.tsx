import { useState } from 'react';
import { Check, Copy, Printer } from 'lucide-react';
import type { IssuedGiftVoucherResponse } from 'shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatDate, kes } from './voucher-format';

function escapeHtml(value: string | null | undefined) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]!));
}

/** A printable card for the customer: the only place the full code appears besides this dialog. */
function printVoucher(voucher: IssuedGiftVoucherResponse) {
  const printWindow = window.open('', '_blank', 'width=560,height=720');
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Bagstreet gift voucher</title>
<style>
  body { margin: 0; padding: 32px; font-family: Georgia, 'Times New Roman', serif; color: #1c1714; background: #fff; }
  .card { max-width: 440px; margin: 0 auto; border: 1px solid #1c1714; padding: 36px 32px; text-align: center; }
  .brand { letter-spacing: 0.35em; font-size: 14px; }
  h1 { font-weight: 400; font-size: 30px; margin: 24px 0 4px; }
  .amount { font-size: 40px; margin: 8px 0 24px; }
  .to, .message { font-family: Arial, sans-serif; font-size: 14px; margin: 6px 0; }
  .message { font-style: italic; color: #4a403a; }
  .code { font-family: 'Courier New', monospace; font-size: 20px; letter-spacing: 0.08em; border: 1px dashed #a27a50; padding: 14px 8px; margin: 24px 0 8px; }
  .small { font-family: Arial, sans-serif; font-size: 11px; color: #6b625c; line-height: 1.6; }
</style></head>
<body><div class="card">
  <div class="brand">BAGSTREET</div>
  <h1>Gift voucher</h1>
  <div class="amount">${escapeHtml(kes(voucher.balance))}</div>
  ${voucher.recipient_name ? `<p class="to">For ${escapeHtml(voucher.recipient_name)}</p>` : ''}
  ${voucher.message ? `<p class="message">“${escapeHtml(voucher.message)}”</p>` : ''}
  <div class="code">${escapeHtml(voucher.code)}</div>
  <p class="small">Valid until ${escapeHtml(formatDate(voucher.expires_at))}. Spend it in the shop or online at checkout,
  over one order or several. Not exchangeable for cash. Keep this code private: anyone with it can spend the balance.
  Full terms: see Gift vouchers in our terms of sale.</p>
</div></body></html>`);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 250);
}

/** Shown once, right after issuing: the full code is never shown again. */
export function IssuedVoucherDialog({ voucher, onClose, replaced = false }: { voucher: IssuedGiftVoucherResponse | null; onClose: () => void; replaced?: boolean }) {
  const [copied, setCopied] = useState(false);
  if (!voucher) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(voucher.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{replaced ? `New code for ····${voucher.code_last4}` : `Gift voucher issued: ${kes(voucher.initial_amount)}`}</DialogTitle>
          <DialogDescription>
            {replaced ? 'The old code no longer works. ' : ''}Give this code to the customer now. For security it is stored scrambled, so it can't be shown again.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-dashed bg-muted/30 px-4 py-5 text-center">
          <p className="select-all break-all font-mono text-xl font-semibold tracking-wider">{voucher.code}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Valid until {formatDate(voucher.expires_at)}{voucher.recipient_name ? ` · for ${voucher.recipient_name}` : ''}
          </p>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button variant="outline" onClick={copy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy code'}
            </Button>
            <Button variant="outline" onClick={() => printVoucher(voucher)}>
              <Printer className="h-4 w-4" />
              Print card
            </Button>
          </div>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
