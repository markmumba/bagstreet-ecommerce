import type { Migration } from './types';

/**
 * Discount codes can require a signed-in account (on by default; decided 10 Oct 2026). Each
 * account can use such a code once, on top of the existing one-use-per-phone rule, so a second
 * SIM is no longer enough to reuse a public percentage code.
 */
export const discountRequiresAccountMigration: Migration = {
    id: '013',
    name: 'discount_requires_account',
    async up(sql) {
        await sql`ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS requires_account BOOLEAN NOT NULL DEFAULT true`;
        await sql`ALTER TABLE discount_code_usages ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL`;
        await sql`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_discount_code_usages_code_user
            ON discount_code_usages(code_id, user_id) WHERE user_id IS NOT NULL
        `;
    },
};
