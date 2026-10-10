/**
 * Staff alerts: one place decides who hears about what. Callers name the kind of alert (its
 * audience); this module picks the recipients, writes the in-app notifications, queues any email
 * and records the live push.
 *
 * | Audience | Recipients                                   | Channels         |
 * |----------|----------------------------------------------|------------------|
 * | orders   | admins + the duty manager (order handover)   | in-app + email   |
 * | money    | admins (only they can resolve it)            | in-app + email   |
 * | stock    | admins + the duty manager                    | in-app + email   |
 * | system   | admins                                       | in-app           |
 *
 * Inside a transaction, pass `tx` and an `AfterCommit`: the alert then exists only if the change
 * that caused it was saved.
 */
import { sql } from '../../lib/db';
import { AfterCommit } from '../../lib/after-commit';
import { enqueueEmail } from '../../services/email-outbox';
import type { EmailJob } from '../../services/email-jobs';
import { notificationsQueries } from '../notifications/notifications.queries';
import { settingsQueries } from '../settings/settings.queries';
import { UsersQueries } from '../users/user.queries';

type Executor = typeof sql;

export type AlertAudience = 'orders' | 'money' | 'stock' | 'system';

const POLICY: Record<AlertAudience, { dutyManager: boolean; email: boolean; eyebrow: string }> = {
    orders: { dutyManager: true, email: true, eyebrow: 'Orders' },
    money: { dutyManager: false, email: true, eyebrow: 'Payments' },
    stock: { dutyManager: true, email: true, eyebrow: 'Inventory' },
    system: { dutyManager: false, email: false, eyebrow: 'System' },
};

export interface StaffMember {
    id: number | string;
    email: string;
    full_name: string;
}

export interface StaffAlert {
    audience: AlertAudience;
    /** Notification type, e.g. PAYMENT_REVERSED (the admin app picks icons by it). */
    type: string;
    title: string;
    body: string;
    /** Dashboard path the notification and email open. */
    link: string;
    data?: Record<string, string>;
    /** Base for email dedupe keys (the recipient's id is appended), so one event emails each person once. */
    dedupeKey?: string;
    /** A purpose-built email instead of the generic staff alert (e.g. the low-stock email). */
    email?: (member: StaffMember) => EmailJob;
}

/** Who receives alerts of this audience right now. */
export async function staffFor(audience: AlertAudience): Promise<StaffMember[]> {
    if (!POLICY[audience].dutyManager) return await UsersQueries.findActiveAdmins();
    const handover = await settingsQueries.getOrderHandover();
    return await UsersQueries.findActiveOrderAlertRecipients(handover.enabled ? handover.managerId : null);
}

/**
 * Raises an alert. Returns the recipients' ids (e.g. for an extra live event). Without `tx` it
 * writes straight away and pushes immediately.
 */
export async function alertStaff(alert: StaffAlert, context: { tx?: Executor; after?: AfterCommit } = {}): Promise<number[]> {
    if (context.tx && !context.after) throw new Error('alertStaff inside a transaction needs an AfterCommit');
    const policy = POLICY[alert.audience];
    const staff = await staffFor(alert.audience);
    if (staff.length === 0) return [];
    const userIds = staff.map((member) => Number(member.id));
    const after = context.after ?? new AfterCommit();

    const created = await notificationsQueries.create(userIds.map((recipient_id) => ({
        recipient_id,
        type: alert.type,
        title: alert.title,
        body: alert.body,
        data: { link: alert.link, ...alert.data },
    })), context.tx);
    after.push(userIds, 'notification', { notifications: created });

    if (policy.email) {
        for (const member of staff) {
            const job: EmailJob = alert.email?.(member) ?? {
                type: 'STAFF_ALERT',
                to: member.email,
                name: member.full_name,
                eyebrow: policy.eyebrow,
                heading: alert.title,
                message: alert.body,
                linkPath: alert.link,
            };
            const dedupeKey = alert.dedupeKey ? `${alert.dedupeKey}:${member.id}` : undefined;
            if (await enqueueEmail(job, { tx: context.tx, dedupeKey })) after.wakeOutbox();
        }
    }

    // Outside a transaction there is nothing to wait for.
    if (!context.after) after.run();
    return userIds;
}
