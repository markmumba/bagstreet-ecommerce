import { sql } from '../../lib/db';

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
};
