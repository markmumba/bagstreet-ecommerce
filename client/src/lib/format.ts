/**
 * The admin's one way of showing money and dates: Kenyan formatting, Nairobi time.
 * Money: "KES 8,900.00" everywhere; `whole` drops the cents for headline figures.
 */
const TIME_ZONE = 'Africa/Nairobi';

const money = new Intl.NumberFormat('en-KE', {
  style: 'currency', currency: 'KES', currencyDisplay: 'code', minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const wholeMoney = new Intl.NumberFormat('en-KE', {
  style: 'currency', currency: 'KES', currencyDisplay: 'code', minimumFractionDigits: 0, maximumFractionDigits: 0,
});
const compactNumber = new Intl.NumberFormat('en-KE', { notation: 'compact', maximumFractionDigits: 1 });
const plainNumber = new Intl.NumberFormat('en-KE');
const date = new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TIME_ZONE });
const shortDate = new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short', timeZone: TIME_ZONE });
const dateTime = new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE });
// en-CA formats dates as YYYY-MM-DD.
const isoDay = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: TIME_ZONE });

const toDate = (value: string | number | Date) => (value instanceof Date ? value : new Date(value));

/** "KES 8,900.00", or "KES 8,900" with `whole`. */
export function formatMoney(amount: number, options: { whole?: boolean } = {}): string {
  return (options.whole ? wholeMoney : money).format(amount);
}

/** "13K", for chart axes. */
export function formatCompact(amount: number): string {
  return compactNumber.format(amount);
}

export function formatNumber(value: number): string {
  return plainNumber.format(value);
}

/** "17 Oct 2026" */
export function formatDate(value: string | number | Date): string {
  return date.format(toDate(value));
}

/** "17 Oct" */
export function formatShortDate(value: string | number | Date): string {
  return shortDate.format(toDate(value));
}

/** "17 Oct 2026, 13:52" */
export function formatDateTime(value: string | number | Date): string {
  return dateTime.format(toDate(value));
}

/** The Nairobi calendar day as YYYY-MM-DD (for date inputs, filenames and exports): never the UTC day. */
export function nairobiDay(value: string | number | Date = new Date()): string {
  return isoDay.format(toDate(value));
}

const relative = new Intl.RelativeTimeFormat('en-KE', { numeric: 'auto', style: 'short' });

/** "just now", "5 min. ago", "3 hr. ago", "yesterday", then the date once it's over a week old. */
export function formatRelative(value: string | number | Date, now: number = Date.now()): string {
  const seconds = Math.round((toDate(value).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return 'just now';
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), 'hour');
  if (abs < 7 * 86400) return relative.format(Math.round(seconds / 86400), 'day');
  return formatDate(value);
}
