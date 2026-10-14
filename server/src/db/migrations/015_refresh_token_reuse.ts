import type { Migration } from './types';

/**
 * A refresh token works once. Used tokens are kept (marked used_at) until they expire, so a second
 * use can be recognised as a stolen token and every session of that account signed out.
 */
export const refreshTokenReuseMigration: Migration = {
    id: '015',
    name: 'refresh_token_reuse',
    async up(sql) {
        await sql`ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS used_at TIMESTAMP`;
    },
};
