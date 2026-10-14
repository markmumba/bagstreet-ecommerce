/**
 * How long after a refresh token is used a second use still counts as the same browser (two tabs
 * loading at once both send the cookie) rather than a stolen copy.
 */
export const REFRESH_REUSE_GRACE_SECONDS = 30;

/** What the database knows about a presented refresh token, judged against the clock in SQL. */
export interface RefreshTokenState {
    expired: boolean;
    used: boolean;
    /** Used within the last REFRESH_REUSE_GRACE_SECONDS. */
    recentlyUsed: boolean;
}

/**
 * - `rotate`: first use. Mark it used and issue the next token.
 * - `concurrent`: a second use moments after the first, e.g. two tabs. Issue a token, keep it used.
 * - `reuse`: a used token presented again later. Someone has a copy: sign out every session.
 * - `invalid`: unknown or expired. Refuse.
 */
export type RefreshVerdict = 'rotate' | 'concurrent' | 'reuse' | 'invalid';

export function judgeRefreshToken(token: RefreshTokenState | undefined): RefreshVerdict {
    if (!token || token.expired) return 'invalid';
    if (!token.used) return 'rotate';
    return token.recentlyUsed ? 'concurrent' : 'reuse';
}
