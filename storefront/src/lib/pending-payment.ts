/**
 * The order a customer placed but hasn't paid for yet. Kept so they can resume payment instead of
 * checking out again (which would create a second order and take stock twice).
 *
 * Holds only the public order reference and the server-signed access token — no phone or email.
 */
export interface PendingPayment {
  ref: string;
  token: string;
  orderNumber?: string | null;
  total?: number;
  savedAt: number;
}

const KEY = 'bagstreet_pending_payment';
/** Matches the server's access-token lifetime; the order itself expires much sooner if unpaid. */
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

export function readPendingPayment(): PendingPayment | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const pending = JSON.parse(raw) as PendingPayment;
    if (!pending.ref || !pending.token || Date.now() - pending.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return pending;
  } catch {
    return null;
  }
}

export function savePendingPayment(pending: Omit<PendingPayment, 'savedAt'>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...pending, savedAt: Date.now() }));
  } catch {
    // Storage unavailable: the customer can still pay now; they just can't resume later from this browser.
  }
}

export function clearPendingPayment(ref?: string) {
  try {
    if (ref && readPendingPayment()?.ref !== ref) return;
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
