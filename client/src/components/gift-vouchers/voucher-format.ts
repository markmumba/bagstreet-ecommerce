import type { GiftVoucherStatus } from 'shared';
import type { Badge } from '@/components/ui/badge';

export const kes = (amount: number) =>
  `KES ${amount.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const formatDate = (value: string) =>
  new Date(value).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });

export const STATUS_LABELS: Record<GiftVoucherStatus, { label: string; variant: React.ComponentProps<typeof Badge>['variant'] }> = {
  active: { label: 'Active', variant: 'success' },
  used: { label: 'Used up', variant: 'neutral' },
  expired: { label: 'Expired', variant: 'warning' },
  voided: { label: 'Cancelled', variant: 'danger' },
};

export const SALE_METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  MPESA: 'M-Pesa',
  CARD: 'Card',
  BANK_TRANSFER: 'Bank transfer',
  OTHER: 'Other',
};
