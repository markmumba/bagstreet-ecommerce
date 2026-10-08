import type { Migration } from './types';

/**
 * JSONB writes used to pass `JSON.stringify(x)::jsonb`, which bun:sql encodes a second time, so
 * rows were stored as JSON strings (jsonb_typeof = 'string') instead of objects. Unwrap them.
 */
const JSONB_COLUMNS: Array<[table: string, column: string]> = [
    ['orders', 'shipping_address'],
    ['in_app_notifications', 'data'],
    ['mpesa_c2b_payments', 'raw_payload'],
    ['payment_transactions', 'raw_payload'],
    ['processed_payment_events', 'raw_payload'],
    ['payment_ledger_entries', 'metadata'],
    ['audit_logs', 'before_state'],
    ['audit_logs', 'after_state'],
    ['audit_logs', 'metadata'],
];

export const unwrapJsonbStringsMigration: Migration = {
    id: '007',
    name: 'unwrap_jsonb_strings',
    async up(sql) {
        for (const [table, column] of JSONB_COLUMNS) {
            await sql.unsafe(`
                UPDATE ${table}
                SET ${column} = (${column} #>> '{}')::jsonb
                WHERE jsonb_typeof(${column}) = 'string'
            `);
        }
    },
};
