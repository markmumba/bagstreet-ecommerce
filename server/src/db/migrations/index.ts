import { initialSchemaMigration } from './001_initial_schema';
import { paymentProviderRecordsMigration } from './002_payment_provider_records';
import { orderPaidAtMigration } from './003_order_paid_at';
import { auditLedgerIdempotencyMigration } from './004_audit_ledger_idempotency';
import { publicIdentifiersMigration } from './005_public_identifiers';
import { walkInSalesMigration } from './006_walk_in_sales';
import { unwrapJsonbStringsMigration } from './007_unwrap_jsonb_strings';
import { emailOutboxMigration } from './008_email_outbox';
import { cartRecoveryMigration } from './009_cart_recovery';
import { cartRecoveryOwnerMigration } from './010_cart_recovery_owner';
import { paymentStatusHeldReversedMigration } from './011_payment_status_held_reversed';
import { complianceControlsMigration } from './012_compliance_controls';
import type { Migration } from './types';

export const migrations: Migration[] = [
    initialSchemaMigration,
    paymentProviderRecordsMigration,
    orderPaidAtMigration,
    auditLedgerIdempotencyMigration,
    publicIdentifiersMigration,
    walkInSalesMigration,
    unwrapJsonbStringsMigration,
    emailOutboxMigration,
    cartRecoveryMigration,
    cartRecoveryOwnerMigration,
    paymentStatusHeldReversedMigration,
    complianceControlsMigration,
];
