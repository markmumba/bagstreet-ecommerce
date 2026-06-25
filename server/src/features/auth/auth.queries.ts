import { sql } from '../../lib/db';

interface PasswordResetToken {
    id: number;
    user_id: number;
    token_hash: string;
    expires_at: Date;
    used_at: Date | null;
    created_at: Date;
}

interface RefreshToken {
    id: number;
    user_id: number;
    token_hash: string;
    expires_at: string;
    created_at: string;
}

export const authQueries = {
    saveRefreshToken: async (userId: number, tokenHash: string, expiresAt: Date): Promise<void> => {
        await sql`
            INSERT INTO refresh_tokens(user_id, token_hash, expires_at)
            VALUES (${userId}, ${tokenHash}, ${expiresAt})
        `;
    },

    findRefreshToken: async (tokenHash: string): Promise<RefreshToken | undefined> => {
        const [token] = await sql<RefreshToken[]>`
            SELECT * FROM refresh_tokens
            WHERE token_hash = ${tokenHash} AND expires_at > CURRENT_TIMESTAMP
        `;
        return token;
    },

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
