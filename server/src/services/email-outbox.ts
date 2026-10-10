/**
 * Transactional email outbox (replaces RabbitMQ).
 *
 * `enqueueEmail` writes the email as a row — inside the caller's transaction when given one, so the
 * email exists if and only if the change that caused it was committed. A worker in the API process
 * claims due rows (FOR UPDATE SKIP LOCKED, so several API instances can't double-send), sends them,
 * and retries failures on a backoff schedule. Delivery is at-least-once: a crash between sending and
 * marking SENT means one duplicate email, which is acceptable for notifications.
 */
import { sql } from '../lib/db';
import { readJsonColumn, toJsonbParam } from '../lib/json-column';
import { sendEmailJob, type EmailJob } from './email-jobs';
import { afterFailure, describeError } from './email-outbox-policy';
import { alertStaff } from '../features/staff-alerts/staff-alerts';

type Executor = typeof sql;

const POLL_INTERVAL_MS = 5_000;
const BATCH_SIZE = 10;
/** A claimed row nobody finished within this time is treated as abandoned (worker crashed). */
const CLAIM_TTL_MINUTES = 5;
const SENT_RETENTION_DAYS = 30;
const FAILED_RETENTION_DAYS = 90;
const CLEANUP_EVERY_MS = 60 * 60_000;

interface OutboxRow {
    id: number;
    job_type: string;
    recipient: string;
    payload: unknown;
    attempts: number;
}

/**
 * Queues an email. Pass `tx` to make it part of a transaction; pass `dedupeKey` to make sure the
 * same event can only ever queue one email. Returns false if the dedupe key was already used.
 */
export async function enqueueEmail(job: EmailJob, options: { tx?: Executor; dedupeKey?: string } = {}): Promise<boolean> {
    const db = options.tx ?? sql;
    const rows = await db<{ id: number }[]>`
        INSERT INTO email_outbox (job_type, recipient, payload, dedupe_key)
        VALUES (${job.type}, ${job.to}, ${toJsonbParam(job)}::jsonb, ${options.dedupeKey ?? null})
        ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
        RETURNING id
    `;
    // Inside a transaction the row isn't visible until commit — the caller wakes the worker after.
    if (!options.tx && rows.length > 0) wakeEmailOutbox();
    return rows.length > 0;
}

/** Claims up to `limit` due rows (and rows abandoned by a crashed worker) for this worker. */
async function claimBatch(limit: number, onlyIds?: number[]): Promise<OutboxRow[]> {
    return await sql.begin(async (tx: typeof sql) => {
        const rows = await tx<OutboxRow[]>`
            SELECT id, job_type, recipient, payload, attempts
            FROM email_outbox
            WHERE (
                (status = 'PENDING' AND next_attempt_at <= now())
                OR (status = 'SENDING' AND locked_until < now())
            )
            ${onlyIds ? tx`AND id IN ${tx(onlyIds)}` : tx``}
            ORDER BY id
            LIMIT ${limit}
            FOR UPDATE SKIP LOCKED
        `;
        if (rows.length === 0) return [];
        await tx`
            UPDATE email_outbox
            SET status = 'SENDING', attempts = attempts + 1,
                locked_until = now() + (${CLAIM_TTL_MINUTES} * interval '1 minute')
            WHERE id IN ${tx(rows.map((row) => row.id))}
        `;
        return rows.map((row) => ({ ...row, id: Number(row.id), attempts: Number(row.attempts) + 1 }));
    }) as unknown as OutboxRow[];
}

export interface OutboxBatchResult {
    claimed: number;
    sent: number;
    retrying: number;
    failed: number;
    skipped: number;
}

/**
 * Sends one batch. `send` is injectable so tests never send real email; `onlyIds` restricts the
 * batch to specific rows (tests only).
 */
export async function processEmailOutboxBatch(
    options: { send?: (job: EmailJob) => Promise<void | boolean>; limit?: number; onlyIds?: number[] } = {},
): Promise<OutboxBatchResult> {
    const send = options.send ?? sendEmailJob;
    const rows = await claimBatch(options.limit ?? BATCH_SIZE, options.onlyIds);
    const result: OutboxBatchResult = { claimed: rows.length, sent: 0, retrying: 0, failed: 0, skipped: 0 };

    for (const row of rows) {
        try {
            const job = readJsonColumn<EmailJob>(row.payload);
            if (!job) throw new Error('Unreadable email payload');
            const delivered = await send(job);
            await sql`
                UPDATE email_outbox
                SET status = ${delivered === false ? 'SKIPPED' : 'SENT'}, sent_at = now(), locked_until = NULL, last_error = NULL
                WHERE id = ${row.id} AND status = 'SENDING'
            `;
            if (delivered === false) result.skipped += 1;
            else result.sent += 1;
        } catch (err) {
            const next = afterFailure(row.attempts);
            const error = describeError(err);
            if (next.status === 'FAILED') {
                await sql`
                    UPDATE email_outbox SET status = 'FAILED', locked_until = NULL, last_error = ${error}
                    WHERE id = ${row.id}
                `;
                result.failed += 1;
                console.error(`[email-outbox] giving up on ${row.job_type} to ${row.recipient} after ${row.attempts} attempts: ${error}`);
                await alertAdminsEmailFailed(row, error);
            } else {
                const delayMs = next.nextAttemptAt.getTime() - Date.now();
                await sql`
                    UPDATE email_outbox
                    SET status = 'PENDING', locked_until = NULL, last_error = ${error},
                        next_attempt_at = now() + (${delayMs} * interval '1 millisecond')
                    WHERE id = ${row.id}
                `;
                result.retrying += 1;
                console.warn(`[email-outbox] ${row.job_type} to ${row.recipient} failed (attempt ${row.attempts}), retrying: ${error}`);
            }
        }
    }
    return result;
}

async function alertAdminsEmailFailed(row: OutboxRow, error: string) {
    try {
        await alertStaff({
            audience: 'system',
            type: 'EMAIL_FAILED',
            title: `Email could not be sent to ${row.recipient}`,
            body: `${row.job_type.replace(/_/g, ' ').toLowerCase()} — gave up after ${row.attempts} attempts. Last error: ${error.slice(0, 200)}`,
            link: '/settings',
            data: { outbox_id: String(row.id) },
        });
    } catch (err) {
        console.error('[email-outbox] could not alert admins:', err);
    }
}

/** Removes old rows: they contain customer email addresses and order details. */
async function cleanupOutbox() {
    await sql`
        DELETE FROM email_outbox
        WHERE (status IN ('SENT', 'SKIPPED') AND sent_at < now() - (${SENT_RETENTION_DAYS} * interval '1 day'))
           OR (status = 'FAILED' AND created_at < now() - (${FAILED_RETENTION_DAYS} * interval '1 day'))
    `;
}

/** Counts for /health/ready and monitoring. */
export async function emailOutboxStats() {
    const [row] = await sql<{ pending: number; failed: number; oldest_pending_seconds: number | null }[]>`
        SELECT
            count(*) FILTER (WHERE status IN ('PENDING', 'SENDING'))::int AS pending,
            count(*) FILTER (WHERE status = 'FAILED')::int AS failed,
            EXTRACT(EPOCH FROM now() - min(created_at) FILTER (WHERE status IN ('PENDING', 'SENDING')))::int AS oldest_pending_seconds
        FROM email_outbox
    `;
    return row ?? { pending: 0, failed: 0, oldest_pending_seconds: null };
}

// ── Worker ──────────────────────────────────────────────────────────────────

let started = false;
let running = false;
let wakeTimer: ReturnType<typeof setTimeout> | null = null;
let lastCleanup = 0;

async function tick() {
    if (running) return;
    running = true;
    try {
        // Keep going while batches come back full, so a backlog drains quickly.
        let result: OutboxBatchResult;
        do {
            result = await processEmailOutboxBatch();
        } while (result.claimed === BATCH_SIZE);

        if (Date.now() - lastCleanup > CLEANUP_EVERY_MS) {
            lastCleanup = Date.now();
            await cleanupOutbox();
        }
    } catch (err) {
        console.error('[email-outbox] worker run failed:', err);
    } finally {
        running = false;
    }
}

/** Sends newly queued email right away instead of waiting for the next poll. Call after commit. */
export function wakeEmailOutbox() {
    if (!started) return;
    if (wakeTimer) clearTimeout(wakeTimer);
    wakeTimer = setTimeout(() => void tick(), 50);
}

export function startEmailOutboxWorker() {
    if (started) return;
    started = true;
    setInterval(() => void tick(), POLL_INTERVAL_MS);
    void tick();
    console.log(`[email-outbox] worker started (every ${POLL_INTERVAL_MS / 1000}s)`);
}
