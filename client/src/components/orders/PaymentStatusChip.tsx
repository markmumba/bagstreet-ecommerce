import { AlertTriangle, Check, Undo2, Wallet, X } from 'lucide-react';
import { PAYMENT_STATUS } from 'shared';
import type { PaymentStatus } from 'shared';
import { cn } from '@/lib/utils';

const WARNING = 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]';
const DANGER = 'bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]';
const SUCCESS = 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]';

export const PAYMENT_STATUS_STYLES: Record<PaymentStatus, { label: string; icon: React.ElementType; className: string; hint?: string }> = {
  [PAYMENT_STATUS.UNPAID]: { label: 'Unpaid', icon: Wallet, className: WARNING },
  [PAYMENT_STATUS.PAID]: { label: 'Paid', icon: Check, className: SUCCESS },
  [PAYMENT_STATUS.FAILED]: { label: 'Failed', icon: X, className: DANGER },
  [PAYMENT_STATUS.HELD]: {
    label: 'Needs review',
    icon: AlertTriangle,
    className: WARNING,
    hint: "Money arrived that doesn't match the order total (too little, or the wrong currency).",
  },
  [PAYMENT_STATUS.REVERSED]: {
    label: 'Reversed',
    icon: Undo2,
    className: DANGER,
    hint: 'The payment provider took this payment back (for example a chargeback).',
  },
};

export function PaymentStatusChip({ status, className }: { status: PaymentStatus; className?: string }) {
  const style = PAYMENT_STATUS_STYLES[status] ?? PAYMENT_STATUS_STYLES[PAYMENT_STATUS.UNPAID];
  const Icon = style.icon;
  return (
    <span
      title={style.hint}
      className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium', style.className, className)}
    >
      <Icon className="h-3 w-3" strokeWidth={2} />
      {style.label}
    </span>
  );
}
