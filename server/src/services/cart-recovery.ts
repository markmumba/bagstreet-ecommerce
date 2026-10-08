import { sql } from '../lib/db';
import { env } from '../config/env';
import { enqueueEmail, wakeEmailOutbox } from './email-outbox';
import { dueRecoveryStage } from '../features/cart-recovery/recovery-policy';
import { ORDER_STATUS, PAYMENT_STATUS } from 'shared/dist';
import { recoveryState, type RecoverySnapshot } from '../features/cart-recovery/recovery.queries';

export async function queueRecoveryReminders() {
    const queued = env.CART_RECOVERY_ENABLED ? await sql.begin(tx => scheduleRecoveryReminders(tx)) as number : 0;
    await sql`DELETE FROM cart_recovery_snapshots WHERE expires_at <= now()`;
    if (queued) wakeEmailOutbox();
    return queued;
}

export async function scheduleRecoveryReminders(tx: typeof sql, onlyIds?: string[]) {
    const rows = await tx<RecoverySnapshot[]>`
        SELECT s.* FROM cart_recovery_snapshots s JOIN email_preferences p ON p.email = s.email
        WHERE p.recovery_opt_in AND s.state <> 'STOPPED' AND s.expires_at > now()
          AND s.last_activity_at <= now() - interval '2 hours'
          AND s.queued_stage = s.reminder_stage AND s.reminder_stage < 2
          AND (s.reminder_stage = 0 OR (${env.CART_RECOVERY_FOLLOWUP_ENABLED} AND s.last_activity_at <= now() - interval '24 hours'))
          AND NOT EXISTS (SELECT 1 FROM orders o WHERE lower(o.customer_email) = s.email AND o.status = ${ORDER_STATUS.PENDING} AND o.payment_status <> ${PAYMENT_STATUS.PAID})
          ${onlyIds ? tx`AND s.id IN ${tx(onlyIds)}` : tx``}
        ORDER BY s.last_activity_at LIMIT 50 FOR UPDATE OF s SKIP LOCKED
    `;
    let count = 0;
    for (const row of rows) {
        const state = await recoveryState(row, tx);
        const stage = dueRecoveryStage({
            lastActivity: new Date(row.last_activity_at).getTime(), expiresAt: new Date(row.expires_at).getTime(),
            stage: row.reminder_stage, optedIn: true, blocked: state !== 'ready',
            followup: env.CART_RECOVERY_FOLLOWUP_ENABLED,
        });
        if (!stage) {
            if (state === 'completed') await tx`UPDATE cart_recovery_snapshots SET state = 'STOPPED' WHERE id = ${row.id}`;
            continue;
        }
        if (await enqueueEmail({ type: 'CART_RECOVERY', to: row.email, snapshotId: row.id, version: row.version, stage }, {
            tx, dedupeKey: `cart-recovery:${row.id}:${row.version}:${stage}`,
        })) count++;
        await tx`UPDATE cart_recovery_snapshots SET queued_stage = ${stage} WHERE id = ${row.id}`;
    }
    return count;
}

let started = false;
let running = false;
export function startCartRecovery() {
    if (started) return;
    started = true;
    const tick = async () => {
        if (running) return;
        running = true;
        try { await queueRecoveryReminders(); }
        catch (error) { console.error('[cart-recovery] scheduler failed:', error); }
        finally { running = false; }
    };
    setInterval(() => void tick(), 5 * 60_000);
    setTimeout(() => void tick(), 30_000);
    console.log(`[cart-recovery] ${env.CART_RECOVERY_ENABLED ? 'enabled: 2-hour reminder' : 'reminders disabled'}, 7-day retention`);
}
