import { randomUUID, timingSafeEqual } from 'node:crypto';
import { sql } from '../../lib/db';
import { env } from '../../config/env';
import { readJsonColumn, toJsonbParam } from '../../lib/json-column';
import type { CartQuoteRequestItem } from 'shared/dist';
import { ORDER_STATUS, PAYMENT_STATUS } from 'shared/dist';
import { RECOVERY_TTL_MS, recoverySelectionKey } from './recovery-policy';
import { hashRecoveryToken, recoveryToken, unsubscribeToken } from './recovery-token';
import { BadRequestError } from '../../lib/errors';

type Executor = typeof sql;
export interface RecoveryPreference {
    id: string; email: string; recovery_opt_in: boolean; consent_at: Date | null;
    unsubscribed_at: Date | null; reminder_window_start: Date | null;
    reminder_count: number; last_reminder_at: Date | null;
}
export interface RecoverySnapshot {
    id: string; email: string; items: unknown; order_id: number | null;
    user_id: number | null;
    state: 'ACTIVE' | 'ORDERED' | 'STOPPED'; version: number;
    last_activity_at: Date; expires_at: Date; created_at: Date;
    reminder_stage: number; queued_stage: number;
}

export async function getRecoveryPreference(email: string, db = sql) {
    const [row] = await db<RecoveryPreference[]>`SELECT * FROM email_preferences WHERE email = ${email.toLowerCase()}`;
    return row ?? null;
}

export async function setRecoveryPreference(email: string, optedIn: boolean) {
    return sql.begin(async (tx: Executor) => {
        const [row] = await tx<RecoveryPreference[]>`
            INSERT INTO email_preferences (id, email, recovery_opt_in, consent_at, consent_source, unsubscribed_at)
            VALUES (${randomUUID()}, ${email.toLowerCase()}, ${optedIn}, ${optedIn ? new Date().toISOString() : null},
                    'account', ${optedIn ? null : new Date().toISOString()})
            ON CONFLICT (email) DO UPDATE SET recovery_opt_in = EXCLUDED.recovery_opt_in,
                consent_at = CASE WHEN EXCLUDED.recovery_opt_in THEN now() ELSE email_preferences.consent_at END,
                consent_source = 'account', unsubscribed_at = EXCLUDED.unsubscribed_at
            RETURNING *
        `;
        if (!optedIn) await tx`UPDATE cart_recovery_snapshots SET state = 'STOPPED' WHERE email = ${email.toLowerCase()}`;
        return row!;
    }) as Promise<RecoveryPreference>;
}

/** A guest may opt in for the first time, but cannot undo a previous unsubscribe by typing that email. */
export async function saveRecoverySnapshot(input: {
    sessionHash: string; email: string; items: CartQuoteRequestItem[]; consent: boolean; touch?: boolean; userId?: number;
}, executor?: Executor) {
    const email = input.email.toLowerCase();
    const save = async (tx: Executor) => {
        await tx`SELECT pg_advisory_xact_lock(hashtext(${'cart-recovery-session:' + input.sessionHash}))`;
        if (input.consent) {
            await tx`
                INSERT INTO email_preferences (id, email, recovery_opt_in, consent_at, consent_source)
                VALUES (${randomUUID()}, ${email}, true, now(), 'checkout') ON CONFLICT (email) DO NOTHING
            `;
        }
        const [preference] = await tx<RecoveryPreference[]>`SELECT * FROM email_preferences WHERE email = ${email} FOR UPDATE`;
        if (!preference?.recovery_opt_in || !input.consent) {
            await tx`DELETE FROM cart_recovery_snapshots WHERE session_hash = ${input.sessionHash} AND state = 'ACTIVE'`;
            return;
        }
        const [existing] = await tx<RecoverySnapshot[]>`
            SELECT * FROM cart_recovery_snapshots WHERE session_hash = ${input.sessionHash} FOR UPDATE
        `;
        // Clearing the local bag after placing an order must not erase the unfinished checkout.
        if (input.items.length === 0) {
            if (existing?.state === 'ACTIVE') await tx`DELETE FROM cart_recovery_snapshots WHERE id = ${existing.id}`;
            return;
        }
        const unchanged = existing?.email === email && existing.state === 'ACTIVE'
            && recoverySelectionKey(readJsonColumn<CartQuoteRequestItem[]>(existing.items) ?? []) === recoverySelectionKey(input.items);
        if (unchanged && new Date(existing.expires_at).getTime() > Date.now()
            && (!input.touch || Date.now() - new Date(existing.last_activity_at).getTime() < 30_000)) return;
        const reset = !existing || existing.email !== email || existing.state !== 'ACTIVE' || new Date(existing.expires_at).getTime() <= Date.now();
        const id = existing?.id ?? randomUUID();
        const version = (existing?.version ?? 0) + 1;
        const expiresAt = new Date(Date.now() + RECOVERY_TTL_MS).toISOString();
        const tokenHash = hashRecoveryToken(recoveryToken(env.JWT_SECRET, id, version, expiresAt));
        await tx`
            INSERT INTO cart_recovery_snapshots (id, session_hash, email, user_id, items, version, token_hash, expires_at)
            VALUES (${id}, ${input.sessionHash}, ${email}, ${input.userId ?? null}, ${toJsonbParam(input.items)}::jsonb, ${version}, ${tokenHash}, ${expiresAt})
            ON CONFLICT (session_hash) DO UPDATE SET email = EXCLUDED.email, items = EXCLUDED.items,
                user_id = EXCLUDED.user_id,
                version = EXCLUDED.version, token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at,
                last_activity_at = now(), state = 'ACTIVE', order_id = NULL,
                created_at = CASE WHEN ${reset} THEN now() ELSE cart_recovery_snapshots.created_at END,
                reminder_stage = CASE WHEN ${reset} THEN 0 ELSE cart_recovery_snapshots.reminder_stage END,
                queued_stage = CASE WHEN ${reset} THEN 0 ELSE cart_recovery_snapshots.reminder_stage END
        `;
    };
    return executor ? save(executor) : sql.begin(save);
}

/** Attach in the order transaction: a successful checkout replaces, rather than duplicates, cart recovery. */
export async function attachRecoveryOrder(tx: Executor, sessionHash: string, email: string, orderId: number) {
    const [preference] = await tx<RecoveryPreference[]>`SELECT * FROM email_preferences WHERE email = ${email.toLowerCase()} FOR UPDATE`;
    if (!preference?.recovery_opt_in) return;
    const [row] = await tx<RecoverySnapshot[]>`
        SELECT * FROM cart_recovery_snapshots WHERE session_hash = ${sessionHash} AND email = ${email.toLowerCase()}
          AND state = 'ACTIVE' AND expires_at > now() FOR UPDATE
    `;
    if (!row) return;
    const version = row.version + 1;
    const expiresAt = new Date(Date.now() + RECOVERY_TTL_MS).toISOString();
    const items = await tx<CartQuoteRequestItem[]>`
        SELECT variant_id, sum(quantity)::int AS quantity FROM order_items WHERE order_id = ${orderId} GROUP BY variant_id ORDER BY variant_id
    `;
    await tx`
        UPDATE cart_recovery_snapshots SET order_id = ${orderId}, state = 'ORDERED', version = ${version},
            items = ${toJsonbParam(items.map(item => ({ variant_id: Number(item.variant_id), quantity: item.quantity })))}::jsonb,
            last_activity_at = now(), expires_at = ${expiresAt}, reminder_stage = 0, queued_stage = 0,
            token_hash = ${hashRecoveryToken(recoveryToken(env.JWT_SECRET, row.id, version, expiresAt))}
        WHERE id = ${row.id}
    `;
}

export async function recoveryState(snapshot: RecoverySnapshot, db = sql): Promise<'ready' | 'payment_pending' | 'completed'> {
    const [flags] = await db<{ money_received: boolean; pending: boolean; cancelled: boolean }[]>`
        SELECT
            EXISTS (SELECT 1 FROM orders o WHERE lower(o.customer_email) = ${snapshot.email}
                AND (o.id = ${snapshot.order_id} OR o.created_at >= ${new Date(snapshot.created_at).toISOString()})
                AND (o.payment_status = ${PAYMENT_STATUS.PAID}
                    OR EXISTS (SELECT 1 FROM payment_ledger_entries l WHERE l.order_id = o.id AND l.direction = 'CREDIT' AND l.amount > 0)
                    OR EXISTS (SELECT 1 FROM payment_transactions p WHERE p.order_id = o.id AND p.status = 'COMPLETED'))
            ) AS money_received,
            EXISTS (SELECT 1 FROM orders o WHERE lower(o.customer_email) = ${snapshot.email}
                AND o.status = ${ORDER_STATUS.PENDING} AND o.payment_status <> ${PAYMENT_STATUS.PAID}) AS pending,
            EXISTS (SELECT 1 FROM orders o WHERE o.id = ${snapshot.order_id} AND o.status = ${ORDER_STATUS.CANCELLED}
                AND NOT EXISTS (SELECT 1 FROM audit_logs a WHERE a.entity_type = 'order' AND a.entity_id = o.id::text AND a.action = 'ORDER_EXPIRED')
            ) AS cancelled
    `;
    if (snapshot.state === 'STOPPED' || flags?.money_received || flags?.cancelled) return 'completed';
    return flags?.pending ? 'payment_pending' : 'ready';
}

export async function snapshotByToken(token: string, db = sql) {
    const [row] = await db<RecoverySnapshot[]>`
        SELECT * FROM cart_recovery_snapshots WHERE token_hash = ${hashRecoveryToken(token)} AND expires_at > now()
    `;
    return row ?? null;
}

/** A payment can arrive after bag restoration. Check again under the source order lock at checkout. */
export async function assertRecoveryCheckoutUnpaid(tx: Executor, sourceOrderId: number) {
    const [source] = await tx<{ status: string; payment_status: string }[]>`
        SELECT status, payment_status FROM orders WHERE id = ${sourceOrderId} FOR UPDATE
    `;
    const [money] = await tx<{ received: boolean }[]>`
        SELECT EXISTS (SELECT 1 FROM payment_ledger_entries WHERE order_id = ${sourceOrderId} AND direction = 'CREDIT' AND amount > 0)
            OR EXISTS (SELECT 1 FROM payment_transactions WHERE order_id = ${sourceOrderId} AND status = 'COMPLETED') AS received
    `;
    if (!source || source.status !== ORDER_STATUS.CANCELLED || source.payment_status === PAYMENT_STATUS.PAID || money?.received) {
        throw new BadRequestError('Your earlier checkout may already be paid or active. Contact BagStreet before placing another order.');
    }
}

export async function unsubscribeRecovery(id: string, token: string, executor?: Executor) {
    const expected = Buffer.from(unsubscribeToken(env.JWT_SECRET, id));
    const actual = Buffer.from(token);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
    const unsubscribe = async (tx: Executor) => {
        const [preference] = await tx<{ email: string }[]>`
            UPDATE email_preferences SET recovery_opt_in = false, unsubscribed_at = now() WHERE id = ${id} RETURNING email
        `;
        if (!preference) return false;
        await tx`DELETE FROM cart_recovery_snapshots WHERE email = ${preference.email}`;
        return true;
    };
    return executor ? unsubscribe(executor) : sql.begin(unsubscribe) as Promise<boolean>;
}
