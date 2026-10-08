/** Retry schedule for outbox emails. Pure, so it's unit-tested. */

/** Delay before retry N (after the Nth failed attempt). Index 0 = after the first failure. */
export const RETRY_DELAYS_MS = [
    60_000,          // 1 minute
    5 * 60_000,      // 5 minutes
    15 * 60_000,     // 15 minutes
    60 * 60_000,     // 1 hour
    6 * 60 * 60_000, // 6 hours
] as const;

/** Total attempts (first try + retries) before an email is marked FAILED. */
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

/** What to do after a failed attempt: retry at a time, or give up. `attempts` includes the one that just failed. */
export function afterFailure(attempts: number, now: number = Date.now()): { status: 'PENDING'; nextAttemptAt: Date } | { status: 'FAILED' } {
    if (attempts >= MAX_ATTEMPTS) return { status: 'FAILED' };
    const delay = RETRY_DELAYS_MS[Math.max(0, attempts - 1)] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]!;
    return { status: 'PENDING', nextAttemptAt: new Date(now + delay) };
}

/** Errors stored for staff to read: trimmed, and without anything that looks like a credential. */
export function describeError(err: unknown): string {
    const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    return text.replace(/(pass(word)?|token|secret|key)=\S+/gi, '$1=***').slice(0, 1000);
}
