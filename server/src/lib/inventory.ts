import { sql } from './db';

export type MovementReason = 'ORDER_PLACED' | 'ORDER_CANCELLED' | 'ADMIN_ADJUSTMENT' | 'RESTOCK';

/**
 * Atomically adjusts stock and records an inventory movement.
 * Pass the transaction (`tx`) when inside sql.begin(), or `sql` directly for standalone use.
 */
export async function adjustStock(
    tx: typeof sql,
    variantId: number,
    delta: number,
    reason: MovementReason,
    referenceId?: number | null,
    note?: string | null,
    createdBy?: number | null
): Promise<void> {
    await tx`
        UPDATE product_variants SET stock = stock + ${delta} WHERE id = ${variantId}
    `;
    await tx`
        INSERT INTO inventory_movements (variant_id, delta, reason, reference_id, note, created_by)
        VALUES (${variantId}, ${delta}, ${reason}, ${referenceId ?? null}, ${note ?? null}, ${createdBy ?? null})
    `;
}
