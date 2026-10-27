import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useCheckVoucherBalance } from '@/hooks/useGiftVouchers';
import { useSeo } from '@/hooks/useSeo';
import { formatPrice } from '@/lib/format';

export const Route = createFileRoute('/gift-vouchers/balance')({ component: VoucherBalancePage });

const STATUS_TEXT = {
  active: null,
  used: 'This voucher has been used up.',
  expired: 'This voucher has expired.',
  voided: 'This voucher has been cancelled. Contact us if you think this is a mistake.',
} as const;

function VoucherBalancePage() {
  useSeo({ title: 'Gift Voucher Balance', description: 'Check what is left on your Bagstreet gift voucher.', canonicalPath: '/gift-vouchers/balance' });
  const check = useCheckVoucherBalance();
  const [code, setCode] = useState('');
  const voucher = check.data?.data;
  const notFound = (check.error as { status?: number } | null)?.status === 404;

  return (
    <div className="max-w-[1440px] mx-auto flex min-h-[70svh] justify-center px-4 pt-[120px] pb-24 sm:px-8 lg:pt-40">
      <div className="w-full max-w-lg">
        <p className="text-label-caps text-brass-text">Gift vouchers</p>
        <h1 className="mt-4 text-display">Check your <em>balance</em></h1>
        <form onSubmit={(e) => { e.preventDefault(); if (code.trim()) check.mutate(code.trim()); }} className="mt-10 flex items-end gap-3">
          <label className="block flex-1">
            <span className="text-label-caps">Voucher code</span>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="BGST-XXXX-XXXX-XXXX-XXXX"
              autoComplete="off" spellCheck={false} maxLength={40}
              className="w-full border-0 border-b border-stone bg-transparent px-0 py-2 font-mono text-[15px] uppercase placeholder:text-foreground-faint focus:border-foreground focus:outline-none focus:ring-0" />
          </label>
          <button type="submit" disabled={!code.trim() || check.isPending}
            className="ui-press h-10 border border-espresso px-5 text-label-caps hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40">
            {check.isPending ? 'Checking…' : 'Check'}
          </button>
        </form>

        {check.isError && (
          <p className="mt-6 text-[14px] text-destructive" role="alert">
            {notFound ? "We couldn't find a voucher with that code. Check it and try again." : (check.error as Error)?.message}
          </p>
        )}
        {voucher && !check.isError && (
          <div className="mt-10 bg-surface p-8" aria-live="polite">
            <p className="text-label-caps text-foreground-muted">Balance</p>
            <p className="mt-2 text-[44px] tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>{formatPrice(voucher.balance)}</p>
            <p className="text-[14px] text-foreground-muted">
              of {formatPrice(voucher.initial_amount)} · valid until {new Date(voucher.expires_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
            {STATUS_TEXT[voucher.status] && <p className="mt-4 text-[14px]">{STATUS_TEXT[voucher.status]}</p>}
            {voucher.status === 'active' && (
              <Link to="/shop" className="ui-press mt-8 inline-flex h-[52px] items-center bg-espresso px-8 text-label-caps text-background hover:bg-espresso-hover">
                Start shopping
              </Link>
            )}
          </div>
        )}
        <p className="mt-12 text-[13px] text-foreground-muted">
          Looking for a gift? <Link to="/gift-vouchers" className="underline underline-offset-4 hover:text-brass-text">Buy a gift voucher</Link>
        </p>
      </div>
    </div>
  );
}
