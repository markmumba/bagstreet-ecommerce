import { sql } from '../../lib/db';
import { judgeRefreshToken, REFRESH_REUSE_GRACE_SECONDS, type RefreshVerdict } from './refresh-policy';

interface PasswordResetToken {
    id: number;
    user_id: number;
    token_hash: string;
    expires_at: Date;
    used_at: Date | null;
    created_at: Date;
}

interface RefreshTokenRow {
    id: number;
    user_id: number;
    expired: boolean;
    used: boolean;
    recently_used: boolean | null;
}

export const authQueries = {
    saveRefreshToken: async (userId: number, tokenHash: string, expiresAt: Date): Promise<void> => {
        // Used tokens are kept until they expire (reuse detection); tidy this account's on each sign-in.
        await sql`DELETE FROM refresh_tokens WHERE user_id = ${userId} AND expires_at <= CURRENT_TIMESTAMP`;
        await sql`
            INSERT INTO refresh_tokens(user_id, token_hash, expires_at)
            VALUES (${userId}, ${tokenHash}, ${expiresAt})
        `;
    },

    /** Whose token this is, used or not, so the caller can check the account before using it. */
    findRefreshTokenOwner: async (tokenHash: string): Promise<number | undefined> => {
        const [row] = await sql<{ user_id: number }[]>`
            SELECT user_id FROM refresh_tokens WHERE token_hash = ${tokenHash}
        `;
        return row?.user_id;
    },

    /**
     * Uses a refresh token, which works once (see refresh-policy). Unless it's refused, `next` is
     * saved as the account's new token. A stolen copy (`reuse`) signs out every session of the account.
     */
    useRefreshToken: async (
        tokenHash: string,
        next: { tokenHash: string; expiresAt: Date },
    ): Promise<{ verdict: RefreshVerdict; userId?: number }> => sql.begin(async (tx) => {
        const [row] = await tx<RefreshTokenRow[]>`
            SELECT id, user_id,
                   expires_at <= CURRENT_TIMESTAMP AS expired,
                   used_at IS NOT NULL AS used,
                   used_at > CURRENT_TIMESTAMP - make_interval(secs => ${REFRESH_REUSE_GRACE_SECONDS}) AS recently_used
            FROM refresh_tokens
            WHERE token_hash = ${tokenHash}
            FOR UPDATE
        `;
        const verdict = judgeRefreshToken(row && {
            expired: row.expired,
            used: row.used,
            recentlyUsed: row.recently_used === true,
        });
        if (!row || verdict === 'invalid') return { verdict };

        if (verdict === 'reuse') {
            await tx`DELETE FROM refresh_tokens WHERE user_id = ${row.user_id}`;
            return { verdict, userId: row.user_id };
        }

        if (verdict === 'rotate') {
            await tx`UPDATE refresh_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ${row.id}`;
        }
        await tx`
            INSERT INTO refresh_tokens(user_id, token_hash, expires_at)
            VALUES (${row.user_id}, ${next.tokenHash}, ${next.expiresAt})
        `;
        return { verdict, userId: row.user_id };
    }),

    deleteRefreshToken: async (tokenHash: string): Promise<void> => {
        await sql`DELETE FROM refresh_tokens WHERE token_hash = ${tokenHash}`;
    },

    deleteAllUserRefreshTokens: async (userId: number): Promise<void> => {
        await sql`DELETE FROM refresh_tokens WHERE user_id = ${userId}`;
    },

    cleanExpiredTokens: async (): Promise<void> => {
        await sql`DELETE FROM refresh_tokens WHERE expires_at <= CURRENT_TIMESTAMP`;
    },

    createPasswordResetToken: async (userId: number, tokenHash: string, expiresAt: Date): Promise<void> => {
        // Invalidate any existing unused tokens for this user first
        await sql`DELETE FROM password_reset_tokens WHERE user_id = ${userId} AND used_at IS NULL`;
        await sql`
            INSERT INTO password_reset_tokens(user_id, token_hash, expires_at)
            VALUES (${userId}, ${tokenHash}, ${expiresAt})
        `;
    },

    findPasswordResetToken: async (tokenHash: string): Promise<PasswordResetToken | undefined> => {
        const [row] = await sql<PasswordResetToken[]>`
            SELECT * FROM password_reset_tokens
            WHERE token_hash = ${tokenHash}
              AND expires_at > NOW()
              AND used_at IS NULL
        `;
        return row;
    },

    consumePasswordResetToken: async (id: number): Promise<void> => {
        await sql`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ${id}`;
    },
};
