import type { Migration } from './types';

export const cartRecoveryOwnerMigration: Migration = {
    id: '010',
    name: 'cart_recovery_owner',
    async up(sql) {
        // An account's saved bag must not be attributed to a guest after logout on the same device.
        await sql`ALTER TABLE cart_recovery_snapshots ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE`;
    },
};
