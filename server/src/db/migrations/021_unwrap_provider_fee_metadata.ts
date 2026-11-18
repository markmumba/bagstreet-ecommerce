import type { Migration } from './types';

/**
 * Provider fee entries from the statement import were still written as `JSON.stringify(x)::jsonb`
 * after migration 007, so their metadata was stored as a JSON string, not an object. The write
 * is fixed (toJsonbParam); this unwraps rows saved before the fix. Safe to run more than once.
 */
export const unwrapProviderFeeMetadataMigration: Migration = {
    id: '021',
    name: 'unwrap_provider_fee_metadata',
    async up(sql) {
        await sql`
            UPDATE payment_ledger_entries
            SET metadata = (metadata #>> '{}')::jsonb
            WHERE entry_type = 'PROVIDER_FEE' AND jsonb_typeof(metadata) = 'string'
        `;
    },
};
