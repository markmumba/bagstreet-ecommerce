import { initialSchemaMigration } from './001_initial_schema';
import { paymentProviderRecordsMigration } from './002_payment_provider_records';
import { orderPaidAtMigration } from './003_order_paid_at';
import { auditLedgerIdempotencyMigration } from './004_audit_ledger_idempotency';
import { publicIdentifiersMigration } from './005_public_identifiers';
import type { Migration } from './types';

export const migrations: Migration[] = [
    initialSchemaMigration,
    paymentProviderRecordsMigration,
    orderPaidAtMigration,
    auditLedgerIdempotencyMigration,
    publicIdentifiersMigration,
];
