/** Real SQL, isolated rollback fixtures, mocked delivery. Never starts the email worker or sends email. */
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { sql, closeDatabase } from '../lib/db';
import { env } from '../config/env';
import { errorHandler } from '../middleware/error-handler';
import type { AppEnv } from '../lib/hono';
import recoveryRoutes from '../features/cart-recovery/recovery.routes';
import { assertRecoveryCheckoutUnpaid, attachRecoveryOrder, getRecoveryPreference, recoveryState, saveRecoverySnapshot, snapshotByToken, unsubscribeRecovery, type RecoverySnapshot } from '../features/cart-recovery/recovery.queries';
import { hashRecoveryToken, recoveryToken, unsubscribeToken } from '../features/cart-recovery/recovery-token';
import { deliverRecoveryWithExecutor, type RecoveryEmail } from '../features/cart-recovery/recovery.delivery';
import { scheduleRecoveryReminders } from '../services/cart-recovery';
import { toJsonbParam } from '../lib/json-column';

const tag = randomUUID();
const email = `recovery-${tag}@example.invalid`;
const sessionHash = hashRecoveryToken(tag);
const results: [string, boolean][] = [];
const check = (name: string, ok: boolean) => results.push([name, ok]);
const original = { enabled: env.CART_RECOVERY_ENABLED, followup: env.CART_RECOVERY_FOLLOWUP_ENABLED };
env.CART_RECOVERY_ENABLED = true;
env.CART_RECOVERY_FOLLOWUP_ENABLED = true;

try {
    const rollback = new Error('ROLLBACK_RECOVERY_FIXTURES');
    try {
        await sql.begin(async (tx: typeof sql) => {
            const [category] = await tx<{ id: number }[]>`INSERT INTO categories (name, slug) VALUES ('Recovery test', ${tag}) RETURNING id`;
            const [product] = await tx<{ id: number }[]>`
                INSERT INTO products (category_id, sku, name, slug, price, stock, image_url, is_active)
                VALUES (${category!.id}, ${tag}, 'Recovery test tote', ${tag}, 4000, 0, '', true) RETURNING id
            `;
            const [variant] = await tx<{ id: number }[]>`
                INSERT INTO product_variants (product_id, sku, stock, is_active) VALUES (${product!.id}, ${tag}, 1, true) RETURNING id
            `;
            const items = [{ variant_id: Number(variant!.id), quantity: 2 }];
            await saveRecoverySnapshot({ sessionHash, email, items, consent: false }, tx);
            check('no snapshot without explicit consent', !(await getRecoveryPreference(email, tx)));
            await saveRecoverySnapshot({ sessionHash, email, items, consent: true }, tx);
            const snapshot = async () => (await tx<RecoverySnapshot[]>`SELECT * FROM cart_recovery_snapshots WHERE session_hash = ${sessionHash}`)[0]!;
            let row = await snapshot();
            const token = recoveryToken(env.JWT_SECRET, row.id, row.version, new Date(row.expires_at).toISOString());
            check('opaque token resolves only its own snapshot', Boolean(await snapshotByToken(token, tx)) && !(await snapshotByToken(token + 'bad', tx)));
            await saveRecoverySnapshot({ sessionHash, email, items, consent: true }, tx);
            check('background sync does not reset inactivity or version', (await snapshot()).version === row.version);
            await tx`UPDATE cart_recovery_snapshots SET last_activity_at = now() - interval '2 hours 1 minute' WHERE id = ${row.id}`;
            check('scheduler enqueues first reminder', await scheduleRecoveryReminders(tx, [row.id]) === 1);
            check('repeat scheduler is idempotent', await scheduleRecoveryReminders(tx, [row.id]) === 0);
            const messages: RecoveryEmail[] = [];
            const send = async (message: RecoveryEmail) => { messages.push(message); };
            const job = { to: email, snapshotId: row.id, version: row.version, stage: 1 as const };
            check('delivery uses current prices and reduced stock', await deliverRecoveryWithExecutor(job, send, tx)
                && messages[0]?.quote.lines[0]?.unit_price === 4000 && messages[0]?.quote.lines[0]?.purchasable_quantity === 1);
            check('repeated delivery does not send again', !await deliverRecoveryWithExecutor(job, send, tx) && messages.length === 1);
            await tx`UPDATE cart_recovery_snapshots SET last_activity_at = now() - interval '24 hours 1 minute' WHERE id = ${row.id}`;
            await tx`UPDATE email_preferences SET last_reminder_at = now() - interval '2 hours 1 minute' WHERE email = ${email}`;
            check('optional 24-hour reminder can be scheduled and delivered', await scheduleRecoveryReminders(tx, [row.id]) === 1
                && await deliverRecoveryWithExecutor({ ...job, stage: 2 }, send, tx) && messages.length === 2);
            await tx`UPDATE cart_recovery_snapshots SET reminder_stage = 0, queued_stage = 0 WHERE id = ${row.id}`;
            check('recipient budget prevents another device/series from sending', !await deliverRecoveryWithExecutor(job, send, tx));
            await tx`UPDATE email_preferences SET reminder_count = 0, last_reminder_at = NULL WHERE email = ${email}`;
            await saveRecoverySnapshot({ sessionHash, email, items, consent: true, touch: true }, tx);
            row = await snapshot();
            check('new activity invalidates the old queued job and link', !await deliverRecoveryWithExecutor(job, send, tx) && !(await snapshotByToken(token, tx)));
            await tx`UPDATE cart_recovery_snapshots SET last_activity_at = now() - interval '2 hours 1 minute' WHERE id = ${row.id}`;
            const freshJob = { ...job, version: row.version };
            const [order] = await tx<{ id: number }[]>`
                INSERT INTO orders (user_id, order_number, total_amount, shipping_address, customer_email, customer_name, customer_phone)
                VALUES (NULL, ${`RT-${tag.slice(0, 8)}`}, 4000, ${toJsonbParam({ full_name: 'Recovery test', address_line1: 'Test', city: 'Nairobi', state: 'Nairobi', country: 'Kenya', postal_code: '' })}::jsonb, ${email}, 'Recovery test', '254700000000') RETURNING id
            `;
            await tx`INSERT INTO order_items (order_id, product_id, variant_id, quantity, unit_price, subtotal) VALUES (${order!.id}, ${product!.id}, ${variant!.id}, 1, 4000, 4000)`;
            await attachRecoveryOrder(tx, sessionHash, email, Number(order!.id));
            row = await snapshot();
            check('order transaction replaces cart recovery', row.state === 'ORDERED' && Number(row.order_id) === Number(order!.id));
            await saveRecoverySnapshot({ sessionHash, email, items: [], consent: true }, tx);
            check('clearing local cart preserves unfinished checkout', (await snapshot()).state === 'ORDERED');
            check('active checkout blocks recovery', await recoveryState(row, tx) === 'payment_pending');
            await tx`UPDATE orders SET status = 'CANCELLED' WHERE id = ${order!.id}`;
            check('manual cancellation suppresses recovery', await recoveryState(row, tx) === 'completed');
            await tx`INSERT INTO audit_logs (action, entity_type, entity_id) VALUES ('ORDER_EXPIRED', 'order', ${String(order!.id)})`;
            check('expired unpaid order can recover to a fresh cart', await recoveryState(row, tx) === 'ready');
            await assertRecoveryCheckoutUnpaid(tx, Number(order!.id));
            check('unpaid source is allowed at fresh checkout', true);
            await tx`INSERT INTO payment_ledger_entries (order_id, entry_type, direction, amount, currency) VALUES (${order!.id}, 'PAYMENT_HELD', 'CREDIT', 100, 'KES')`;
            check('money held for review blocks another payment', await recoveryState(row, tx) === 'completed');
            await tx`UPDATE orders SET payment_status = 'PAID' WHERE id = ${order!.id}`;
            check('late payment suppresses queued reminder', !await deliverRecoveryWithExecutor({ ...freshJob, version: row.version }, send, tx));
            let latePaymentBlocked = false;
            try { await assertRecoveryCheckoutUnpaid(tx, Number(order!.id)); }
            catch { latePaymentBlocked = true; }
            check('payment arriving after restore also blocks fresh checkout', latePaymentBlocked);
            const preference = (await getRecoveryPreference(email, tx))!;
            check('invalid unsubscribe token cannot change preferences', !await unsubscribeRecovery(preference.id, 'wrong', tx));
            check('valid unsubscribe cancels recovery', await unsubscribeRecovery(preference.id, unsubscribeToken(env.JWT_SECRET, preference.id), tx)
                && !(await getRecoveryPreference(email, tx))?.recovery_opt_in);
            await saveRecoverySnapshot({ sessionHash, email, items, consent: true }, tx);
            check('anonymous opt-in cannot override an unsubscribe', !(await getRecoveryPreference(email, tx))?.recovery_opt_in && !(await snapshotByToken(token, tx)));
            throw rollback;
        });
    } catch (error) {
        if (error !== rollback) throw error;
    }

    // Route checks use current (not abandoned) snapshots, so the live scheduler cannot send these.
    const app = new Hono<AppEnv>();
    app.onError(errorHandler);
    app.route('/api/cart-recovery', recoveryRoutes);
    const response = await app.request('/api/cart-recovery/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, consent: true, items: [{ variant_id: 1, quantity: 1 }] }),
    });
    check('guest checkout accepts explicit opt-in', response.status === 200);
    const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
    const sessionToken = cookie.split('=')[1]!;
    const [row] = await sql<RecoverySnapshot[]>`SELECT * FROM cart_recovery_snapshots WHERE session_hash = ${hashRecoveryToken(sessionToken)}`;
    const token = recoveryToken(env.JWT_SECRET, row!.id, row!.version, new Date(row!.expires_at).toISOString());
    const beforeVersion = row!.version;
    const view = await app.request(`/api/cart-recovery/bag?token=${token}`);
    check('GET recovery is read-only and exposes no email, address or order details', view.status === 200
        && !JSON.stringify(await view.json()).includes(email) && (await snapshotByToken(token))?.version === beforeVersion);
    const denied = await app.request('/api/cart-recovery/sync', { method: 'POST', headers: { Origin: 'https://untrusted.invalid', 'Content-Type': 'application/json' }, body: '{}' });
    check('foreign-origin cookie writes are rejected', denied.status === 403);
    const preferences = await app.request('/api/cart-recovery/preferences');
    check('account preferences require authentication', preferences.status === 401);

    if (process.argv.includes('--preview')) {
        const [available] = await sql<{ id: number }[]>`
            SELECT v.id FROM product_variants v JOIN products p ON p.id = v.product_id
            WHERE v.stock > 0 AND v.is_active AND p.is_active LIMIT 1
        `;
        if (!available) throw new Error('A stocked product is required for the browser preview');
        await saveRecoverySnapshot({ sessionHash: hashRecoveryToken(sessionToken), email, consent: true, items: [{ variant_id: Number(available.id), quantity: 100 }] });
        const [preview] = await sql<RecoverySnapshot[]>`SELECT * FROM cart_recovery_snapshots WHERE email = ${email}`;
        const preference = (await getRecoveryPreference(email))!;
        const previewToken = recoveryToken(env.JWT_SECRET, preview!.id, preview!.version, new Date(preview!.expires_at).toISOString());
        console.log(`PREVIEW_BAG=${env.STOREFRONT_URL}/recover-bag?token=${previewToken}`);
        console.log(`PREVIEW_UNSUBSCRIBE=${env.STOREFRONT_URL}/email-preferences?id=${preference.id}&token=${unsubscribeToken(env.JWT_SECRET, preference.id)}`);
        console.log('Press Enter after browser checks to remove preview fixtures.');
        const reader = Bun.stdin.stream().getReader();
        await reader.read();
        await reader.cancel();
        reader.releaseLock();
    }
} catch (error) {
    console.error(error);
    process.exitCode = 1;
} finally {
    await sql`DELETE FROM email_preferences WHERE email = ${email}`;
    env.CART_RECOVERY_ENABLED = original.enabled;
    env.CART_RECOVERY_FOLLOWUP_ENABLED = original.followup;
    await closeDatabase();
}
for (const [name, ok] of results) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
if (results.some(([, ok]) => !ok)) process.exitCode = 1;
console.log(`${results.filter(([, ok]) => ok).length}/${results.length} recovery checks passed. No emails sent.`);
