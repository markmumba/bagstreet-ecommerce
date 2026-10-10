import type { CartQuoteRequestItem, CartQuoteResponse } from 'shared/dist';
import { sql } from '../../lib/db';
import { env } from '../../config/env';
import { readJsonColumn } from '../../lib/json-column';
import { sendCartRecoveryEmail } from '../../lib/email';
import { quoteOrder } from '../quote/quote.queries';
import { recoveryState, type RecoveryPreference, type RecoverySnapshot } from './recovery.queries';
import { dueRecoveryStage, withinRecoveryBudget } from './recovery-policy';
import { recoveryToken, unsubscribeToken } from './recovery-token';

export interface RecoveryEmail {
    to: string; quote: CartQuoteResponse; recoveryUrl: string; unsubscribeUrl: string; checkout: boolean; final: boolean;
}

/** Recheck at delivery, not just scheduling. Recipient locking also caps reminders across devices and API instances. */
export async function deliverRecoveryReminder(job: {
    to: string; snapshotId: string; version: number; stage: 1 | 2;
}, send: (email: RecoveryEmail) => Promise<void> = sendCartRecoveryEmail): Promise<boolean> {
    return deliverRecoveryWithExecutor(job, send);
}

export async function deliverRecoveryWithExecutor(job: {
    to: string; snapshotId: string; version: number; stage: 1 | 2;
}, send: (email: RecoveryEmail) => Promise<void>, executor?: typeof sql): Promise<boolean> {
    if (!env.CART_RECOVERY_ENABLED) return false;
    const deliver = async (tx: typeof sql) => {
        const [preference] = await tx<RecoveryPreference[]>`SELECT * FROM email_preferences WHERE email = ${job.to} FOR UPDATE`;
        const [snapshot] = await tx<RecoverySnapshot[]>`SELECT * FROM cart_recovery_snapshots WHERE id = ${job.snapshotId} FOR UPDATE`;
        if (!preference || !snapshot || snapshot.email !== job.to || snapshot.version !== job.version) return false;
        const stage = dueRecoveryStage({
            lastActivity: new Date(snapshot.last_activity_at).getTime(), expiresAt: new Date(snapshot.expires_at).getTime(),
            stage: snapshot.reminder_stage, optedIn: preference.recovery_opt_in,
            blocked: await recoveryState(snapshot, tx) !== 'ready', followup: env.CART_RECOVERY_FOLLOWUP_ENABLED,
        });
        if (stage !== job.stage || !withinRecoveryBudget({
            windowStart: preference.reminder_window_start ? new Date(preference.reminder_window_start).getTime() : null,
            count: preference.reminder_count, lastSent: preference.last_reminder_at ? new Date(preference.last_reminder_at).getTime() : null,
        })) return false;
        const quote = await quoteOrder({ items: readJsonColumn<CartQuoteRequestItem[]>(snapshot.items) ?? [] }, { db: tx });
        if (quote.item_count === 0) {
            await tx`UPDATE cart_recovery_snapshots SET state = 'STOPPED' WHERE id = ${snapshot.id}`;
            return false;
        }
        const recoveryUrl = new URL('/recover-bag', env.STOREFRONT_URL);
        recoveryUrl.searchParams.set('token', recoveryToken(env.JWT_SECRET, snapshot.id, snapshot.version, new Date(snapshot.expires_at).toISOString()));
        const unsubscribeUrl = new URL('/email-preferences', env.STOREFRONT_URL);
        unsubscribeUrl.searchParams.set('id', preference.id);
        unsubscribeUrl.searchParams.set('token', unsubscribeToken(env.JWT_SECRET, preference.id));
        await send({ to: job.to, quote, recoveryUrl: recoveryUrl.toString(), unsubscribeUrl: unsubscribeUrl.toString(), checkout: snapshot.state === 'ORDERED', final: stage === 2 });
        await tx`UPDATE cart_recovery_snapshots SET reminder_stage = ${stage}, queued_stage = ${stage} WHERE id = ${snapshot.id}`;
        await tx`
            UPDATE email_preferences SET last_reminder_at = now(),
                reminder_count = CASE WHEN reminder_window_start IS NULL OR reminder_window_start <= now() - interval '7 days' THEN 1 ELSE reminder_count + 1 END,
                reminder_window_start = CASE WHEN reminder_window_start IS NULL OR reminder_window_start <= now() - interval '7 days' THEN now() ELSE reminder_window_start END
            WHERE id = ${preference.id}
        `;
        return true;
    };
    return executor ? deliver(executor) : sql.begin(deliver) as Promise<boolean>;
}
