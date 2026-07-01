import { useEffect, useState } from 'react';
import { Download, FileText, Printer, X } from 'lucide-react';
import type { OrderReceiptResponse } from 'shared';
import { useOrderReceipt } from '@/hooks/useOrders';
import { printReceipt } from '@/lib/receipt-print';

interface PaymentReceiptProps {
  orderId: string;
  enabled: boolean;
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(date: string) {
  return new Date(date).toLocaleString('en-KE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function ReceiptPreview({ receipt }: { receipt: OrderReceiptResponse }) {
  const orderNumber = receipt.order_number ?? receipt.order_id;
  return (
    <div className="relative mx-auto w-full max-w-[420px] overflow-visible text-[#171717]">
      <div className="overflow-hidden rounded-3xl bg-[#f7f7f5] shadow-2xl">
        <div className="px-7 pb-4 pt-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid h-8 w-8 grid-cols-3 gap-1">
                {Array.from({ length: 9 }).map((_, index) => (
                  <span key={index} className="rounded-full bg-[#171717]" />
                ))}
              </div>
              <div>
                <p className="text-base font-semibold">BagStreet</p>
                <p className="text-xs text-[#666]">Payment receipt</p>
              </div>
            </div>
            <div className="text-right text-[11px] leading-5 text-[#555]">
              <p>{receipt.receipt_number}</p>
              <p>{formatDate(receipt.paid_at)}</p>
            </div>
          </div>

          <div className="mt-8">
            <h3 className="text-lg font-semibold">Payment received</h3>
            <p className="mt-2 text-xs leading-5 text-[#555]">
              Order {orderNumber} was paid successfully.
            </p>
            <p className="mt-3 text-xs text-[#555]">
              Customer: <span className="font-medium text-[#171717]">{receipt.customer_name}</span>
            </p>
          </div>
        </div>

        <div className="relative border-y border-dashed border-[#d7d7d2] px-7 py-6">
          <div className="absolute -left-3 top-0 h-6 w-6 -translate-y-1/2 rounded-full bg-black/50" />
          <div className="absolute -right-3 top-0 h-6 w-6 -translate-y-1/2 rounded-full bg-black/50" />
          <div className="space-y-5">
            {receipt.items.map((item, index) => {
              const variant = [item.variant_size, item.variant_color].filter(Boolean).join(' / ');
              return (
                <div key={item.id} className="grid grid-cols-[1.5rem_1fr_auto] gap-3 text-xs">
                  <span className="text-[#555]">{index + 1}</span>
                  <div>
                    <p className="font-medium leading-5">{item.product_name}</p>
                    {variant && <p className="mt-0.5 text-[#666]">{variant}</p>}
                    <p className="mt-2 text-[#666]">
                      {item.quantity} x {formatMoney(item.unit_price, receipt.currency)}
                    </p>
                  </div>
                  <p className="font-medium">{formatMoney(item.subtotal, receipt.currency)}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-7 py-6">
          <div className="rounded-xl bg-[#ecece8] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-base font-semibold">Total paid</p>
                <div className="mt-4 space-y-1.5 text-xs text-[#555]">
                  <p>Subtotal: {formatMoney(receipt.subtotal, receipt.currency)}</p>
                  <p>Delivery: {formatMoney(receipt.shipping_cost, receipt.currency)}</p>
                  {receipt.discount_amount > 0 && (
                    <p>Discount: -{formatMoney(receipt.discount_amount, receipt.currency)}</p>
                  )}
                </div>
              </div>
              <p className="text-xl font-semibold tabular-nums">
                {formatMoney(receipt.total_amount, receipt.currency)}
              </p>
            </div>
          </div>

          <div className="mt-7">
            <p className="text-sm font-semibold">Payment details</p>
            <div className="mt-3 space-y-1 text-xs leading-5 text-[#555]">
              <p>Provider: {receipt.payment_provider}</p>
              {receipt.payment_method && <p>Method: {receipt.payment_method}</p>}
              {receipt.payment_reference && <p className="break-all">Reference: {receipt.payment_reference}</p>}
              <p>Receipt: {receipt.receipt_number}</p>
            </div>
          </div>
        </div>

        <div className="flex items-end justify-between bg-[#ecece8] px-7 py-5 text-[11px] text-[#555]">
          <div>
            <p>BagStreet</p>
            <p>Issued {formatDate(receipt.issued_at)}</p>
          </div>
          <div className="text-right">
            <p>Order {orderNumber}</p>
            <p>{receipt.customer_email ?? receipt.customer_phone ?? ''}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReceiptModal({
  receipt,
  onClose,
}: {
  receipt: OrderReceiptResponse;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-black/50 px-4 py-8" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close receipt"
        onClick={onClose}
        className="fixed right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-background text-foreground shadow-sm"
      >
        <X className="h-5 w-5" strokeWidth={1.6} />
      </button>
      <div className="mx-auto flex min-h-full max-w-[460px] flex-col justify-center gap-4">
        <ReceiptPreview receipt={receipt} />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => printReceipt(receipt)}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-background px-4 text-sm font-medium text-primary shadow-sm"
          >
            <Printer className="h-4 w-4" strokeWidth={1.6} />
            Print
          </button>
          <button
            type="button"
            onClick={() => printReceipt(receipt)}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-background px-4 text-sm font-medium text-primary shadow-sm"
          >
            <Download className="h-4 w-4" strokeWidth={1.6} />
            Save PDF
          </button>
        </div>
      </div>
    </div>
  );
}

export function PaymentReceipt({ orderId, enabled }: PaymentReceiptProps) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useOrderReceipt(orderId, enabled);
  const receipt = data?.data;

  if (!enabled) return null;

  return (
    <section className="border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />
        <h2 className="font-semibold">Payment receipt</h2>
      </div>

      {isLoading && (
        <div className="mt-5 space-y-3">
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="h-4 w-48 animate-pulse rounded bg-muted" />
        </div>
      )}

      {isError && (
        <p className="mt-4 text-sm text-muted-foreground">
          We could not load your receipt right now.
        </p>
      )}

      {receipt && (
        <>
          <div className="mt-5 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Receipt</span>
              <span className="font-medium">{receipt.receipt_number}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Paid</span>
              <span className="text-right font-medium">{formatDate(receipt.paid_at)}</span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              <FileText className="h-4 w-4" strokeWidth={1.6} />
              View receipt
            </button>
            <button
              type="button"
              onClick={() => printReceipt(receipt)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-medium hover:bg-muted"
            >
              <Printer className="h-4 w-4" strokeWidth={1.6} />
              Print
            </button>
            <button
              type="button"
              onClick={() => printReceipt(receipt)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-medium hover:bg-muted"
            >
              <Download className="h-4 w-4" strokeWidth={1.6} />
              Save PDF
            </button>
          </div>
        </>
      )}

      {open && receipt && <ReceiptModal receipt={receipt} onClose={() => setOpen(false)} />}
    </section>
  );
}
