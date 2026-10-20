import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { GIFT_VOUCHER_STATUS, USER_ROLE, type GiftVoucherStatus, type IssuedGiftVoucherResponse } from 'shared';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/context/AuthContext';
import { useGiftVoucherSummary, useGiftVouchers } from '@/hooks/useGiftVouchers';
import { useListParams } from '@/hooks/useListParams';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorNotice, errorMessage } from '@/components/ui/notice';
import { IssueVoucherForm } from '@/components/gift-vouchers/IssueVoucherForm';
import { IssuedVoucherDialog } from '@/components/gift-vouchers/IssuedVoucherDialog';
import { CheckBalanceCard } from '@/components/gift-vouchers/CheckBalanceCard';
import { VoucherSheet } from '@/components/gift-vouchers/VoucherSheet';
import { STATUS_LABELS, formatDate, kes } from '@/components/gift-vouchers/voucher-format';

export const Route = createFileRoute('/gift-vouchers')({
  component: GiftVouchersPage,
});

const LIMIT = 20;

function GiftVouchersPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === USER_ROLE.ADMIN;
  // Status, search and page live in the URL.
  const list = useListParams({ status: '' });
  const { page, setPage, searchText: search, setSearchText: setSearch, query: debouncedSearch } = list;
  const status = (list.params.status || undefined) as GiftVoucherStatus | undefined;
  const setStatus = (next: GiftVoucherStatus | undefined) => list.update({ status: next ?? '' });
  const [issued, setIssued] = useState<IssuedGiftVoucherResponse | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useGiftVouchers({ page, limit: LIMIT, status, search: debouncedSearch || undefined });
  const { data: summary } = useGiftVoucherSummary(isAdmin);
  const vouchers = data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / LIMIT));
  const filtered = Boolean(status || debouncedSearch);

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-semibold leading-tight">Gift vouchers</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sell vouchers at the till, check balances, and see what is still owed</p>
        </div>

        {isAdmin && summary && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Owed to holders" value={kes(summary.liability)} hint="Unspent on live vouchers: taken, not yet earned" />
            <Stat label="Sold" value={kes(summary.sold)} hint={`${summary.counts.active} active · ${summary.counts.used} used up`} />
            <Stat label="Spent on orders" value={kes(summary.redeemed)} hint="Counts as revenue when spent" />
            <Stat label="Expired unspent (breakage)" value={kes(summary.expired_unspent)} hint={`${summary.counts.expired} expired · ${summary.counts.voided} cancelled · income once expired`} />
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <div className="space-y-6">
            <IssueVoucherForm onIssued={setIssued} />
            <CheckBalanceCard onOpen={setOpenId} />
          </div>

          <section className="rounded-xl border bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
              <h2 className="mr-auto text-sm font-semibold">Vouchers</h2>
              <Input type="search" aria-label="Search vouchers" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Last 4, name, phone…" className="h-9 w-48" spellCheck={false} autoComplete="off" />
              <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by status">
                <FilterButton active={!status} onClick={() => setStatus(undefined)}>All</FilterButton>
                {Object.values(GIFT_VOUCHER_STATUS).map((s) => (
                  <FilterButton key={s} active={status === s} onClick={() => setStatus(s)}>{STATUS_LABELS[s].label}</FilterButton>
                ))}
              </div>
            </div>
            <div className="divide-y">
              {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading vouchers…</p>}
              {isError && (
                <div className="p-4">
                  <ErrorNotice>{errorMessage(error, 'Vouchers couldn’t be loaded. Check your connection, then refresh the page.')}</ErrorNotice>
                </div>
              )}
              {!isLoading && !isError && vouchers.length === 0 && (
                filtered ? (
                  <div className="flex flex-wrap items-center gap-2 p-4 text-sm text-muted-foreground">
                    <span>No vouchers match this {status && debouncedSearch ? 'filter and search' : status ? 'filter' : 'search'}.</span>
                    <Button size="sm" variant="outline" className="h-8"
                      onClick={() => { setSearch(''); list.update({ status: '', q: '' }); }}>
                      Clear filters
                    </Button>
                  </div>
                ) : (
                  <p className="p-4 text-sm text-muted-foreground">No vouchers yet. Sell one with the form on this page.</p>
                )
              )}
              {vouchers.map((voucher) => (
                <button key={voucher.id} type="button" onClick={() => setOpenId(voucher.id)}
                  className="grid w-full gap-1 px-4 py-3 text-left hover:bg-muted/40 md:grid-cols-[1fr_auto] md:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold">····{voucher.code_last4}</span>
                      <Badge variant={STATUS_LABELS[voucher.status].variant}>{STATUS_LABELS[voucher.status].label}</Badge>
                      {voucher.held > 0 && <Badge variant="warning">{kes(voucher.held)} held</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[voucher.recipient_name && `For ${voucher.recipient_name}`, `Issued ${formatDate(voucher.created_at)}`, `valid until ${formatDate(voucher.expires_at)}`]
                        .filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <p className="text-sm tabular-nums">
                    <span className="font-semibold">{kes(voucher.balance)}</span>
                    <span className="text-muted-foreground"> / {kes(voucher.initial_amount)}</span>
                  </p>
                </button>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
                <span className="text-muted-foreground">Page {page} of {totalPages}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                  <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      <IssuedVoucherDialog voucher={issued} onClose={() => setIssued(null)} />
      <VoucherSheet voucherId={openId} isAdmin={isAdmin} onClose={() => setOpenId(null)} />
    </DashboardLayout>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <Button size="sm" variant={active ? 'default' : 'ghost'} className="h-8" aria-pressed={active} onClick={onClick}>{children}</Button>;
}
