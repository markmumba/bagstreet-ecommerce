/**
 * Daily Paystack reconciliation against a real database, with Paystack and staff alerts faked:
 * no network call, no email to anyone. Disposable fixtures (ZZ-RECON-*), removed at the end.
 *
 *   bun run test:paystack-reconciliation
 */
import 'dotenv/config';
import { sql, closeDatabase } from '../lib/db';
import { env } from '../config/env';
import type { PaymentAttemptStatus } from '../features/payments/attempt-status';
import { paymentsQueries } from '../features/payments/payments.queries';
import { applyOrderEvent, createOrder } from '../features/orders/lifecycle/order-lifecycle';
import type { Actor } from '../features/orders/lifecycle/transitions';
import { PAYSTACK } from '../features/payments/paystack-payments';
import { nairobiDayWindow } from '../features/payments/paystack-reconciliation';
import { reconcilePaystackDay, type ReconciliationDeps } from '../services/paystack-daily-reconciliation';
import type { PaystackListedTransaction } from '../services/paystack';
import type { StaffAlert } from '../features/staff-alerts/staff-alerts';

if (env.NODE_ENV === 'production') throw new Error('Reconciliation fixtures must not run in production');

// A day long before any real payment, so real attempts can never fall inside the window.
const DAY = '2001-02-03';
const IN_DAY = new Date(nairobiDayWindow(DAY).start.getTime() + 10 * 60 * 60 * 1000);
const TAG = `ZZ-RECON-${Date.now().toString(36)}`;

const results: [string, boolean, string?][] = [];
const check = (name: string, ok: boolean, detail?: string) => {
    results.push([name, ok, detail]);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail && !ok ? ` (${detail})` : ''}`);
};

// ── Fixtures ─────────────────────────────────────────────────────────────────
const [cat] = await sql`INSERT INTO categories(name, slug, description) VALUES (${TAG}, ${TAG.toLowerCase()}, '') RETURNING id`;
const [prod] = await sql`INSERT INTO products(category_id, sku, name, slug, description, price, stock, image_url, is_active)
    VALUES (${cat.id}, ${TAG}, ${TAG}, ${TAG.toLowerCase()}, '', 1000, 0, '', true) RETURNING id`;
const [variant] = await sql`INSERT INTO product_variants(product_id, sku, stock, is_active) VALUES (${prod.id}, ${`${TAG}-V`}, 50, true) RETURNING id`;
const V = Number(variant.id);

// Staff emails can't go out: every key the lifecycle could use for these orders is reserved first
// as an already-skipped ZZ_TEST row, so real emails are dropped as duplicates.
const staffIds: number[] = (await sql`SELECT id FROM users`).map((r: any) => Number(r.id));
const MONEY_ALERTS = ['PAYMENT_MISMATCH', 'REFUND_REQUIRED', 'PAYMENT_REVERSED', 'PAYMENT_INIT_FAILED'];
const reservedKeys: string[] = [];
const reserveEmailKeys = async (keys: string[]) => {
    reservedKeys.push(...keys);
    for (const key of keys) {
        await sql`INSERT INTO email_outbox (job_type, recipient, payload, dedupe_key, status, sent_at)
            VALUES ('ZZ_TEST', 'zz-outbox-guard@example.invalid', '{}'::jsonb, ${key}, 'SKIPPED', now())
            ON CONFLICT DO NOTHING`;
    }
};

const CHECKOUT: Actor = { kind: 'customer', isOwner: true, via: 'checkout' };
const SYSTEM: Actor = { kind: 'system' };
const orderIds: number[] = [];
let phoneSeq = 0;
async function newOrder(): Promise<{ id: number; order_number: string }> {
    const phone = `2547${String(Date.now()).slice(-6)}${String(phoneSeq++).padStart(2, '0')}`;
    const order: any = await createOrder({
        userId: null,
        items: [{ variant_id: V, product_id: Number(prod.id), quantity: 1, unit_price: 1000, variant_sku: `${TAG}-V`, variant_size: null, variant_color: null }],
        totalAmount: 1000,
        shippingAddress: { full_name: 'ZZ Recon', phone, address_line1: 'x', city: 'x', state: 'x', postal_code: '', country: 'Kenya' } as any,
        shippingLocationId: null, shippingCost: 0, discountCode: null, discountAmount: 0,
        customerName: 'ZZ Recon', customerPhone: phone, customerEmail: null,
    } as any, { type: 'placed_online' }, CHECKOUT);
    const id = Number(order.id);
    orderIds.push(id);
    await reserveEmailKeys([
        `order-confirmation:${id}`, `order-expired:${id}`,
        ...staffIds.flatMap((s) => [`admin-order-confirmed:${id}:${s}`, ...MONEY_ALERTS.map((t) => `staff-alert:${t}:${id}:${s}`)]),
    ]);
    const [row] = await sql`SELECT order_number FROM orders WHERE id = ${id}`;
    return { id, order_number: row.order_number };
}

async function newAttempt(orderId: number, reference: string, status: PaymentAttemptStatus) {
    const tx = await paymentsQueries.createProviderTransaction({
        order_id: orderId, provider: PAYSTACK, provider_reference: reference, merchant_reference: reference,
        amount: 1000, currency: 'KES', status, raw_payload: { zz: true },
    });
    await sql`UPDATE payment_transactions SET created_at = ${IN_DAY.toISOString()} WHERE id = ${tx.id}`;
    return tx;
}

const stateOf = async (id: number) => {
    const [o] = await sql`SELECT status, payment_status FROM orders WHERE id = ${id}`;
    return `${o.status}/${o.payment_status}`;
};
const captures = async (reference: string) =>
    (await sql`SELECT count(*)::int AS n, COALESCE(sum(amount), 0)::float AS total FROM payment_ledger_entries
               WHERE entry_type = 'PAYMENT_CAPTURED' AND reference = ${`${PAYSTACK}:${reference}`}`)[0] as { n: number; total: number };
const attemptStatus = async (reference: string) =>
    (await sql`SELECT status FROM payment_transactions WHERE provider_reference = ${reference}`)[0]?.status as string;

// ── Fake Paystack ────────────────────────────────────────────────────────────
const listed: PaystackListedTransaction[] = [];
const verifyAnswers = new Map<string, { status: string; amount: number }>();
const listing = (reference: string, status: string, amount = 1000): PaystackListedTransaction =>
    ({ reference, status, amount, currency: 'KES', createdAt: IN_DAY.toISOString(), raw: null });
const alerts: StaffAlert[] = [];
let listFails = false;
const deps: ReconciliationDeps = {
    listTransactions: async () => {
        if (listFails) throw new Error('Paystack list transactions failed: 503');
        return listed;
    },
    verifyTransaction: async (reference) => {
        const answer = verifyAnswers.get(reference);
        if (!answer) return null;
        return { data: { reference, status: answer.status, amount: answer.amount * 100, currency: 'KES', gateway_response: 'zz' }, raw: null };
    },
    alertStaff: async (alert) => { alerts.push(alert); },
};
const ref = (name: string) => `${TAG}-${name}`;

try {
    await sql`DELETE FROM paystack_reconciliation_issues WHERE day = ${DAY}`;
    await sql`DELETE FROM paystack_reconciliation_runs WHERE day = ${DAY}`;

    // A. Customer paid, but the attempt was marked failed (e.g. "abandoned" before the PIN went in).
    const a = await newOrder();
    await newAttempt(a.id, ref('A'), 'FAILED');
    listed.push(listing(ref('A'), 'success'));
    verifyAnswers.set(ref('A'), { status: 'success', amount: 1000 });

    // B. Paid after the order expired, webhook lost: must take the late-payment path.
    const b = await newOrder();
    await newAttempt(b.id, ref('B'), 'FAILED');
    await applyOrderEvent(b.id, { type: 'expired' }, SYSTEM);
    const bBefore = await stateOf(b.id);
    listed.push(listing(ref('B'), 'success'));
    verifyAnswers.set(ref('B'), { status: 'success', amount: 1000 });

    // C. Still pending here; Paystack failed it.
    const c = await newOrder();
    await newAttempt(c.id, ref('C'), 'PENDING');
    listed.push(listing(ref('C'), 'failed'));
    verifyAnswers.set(ref('C'), { status: 'failed', amount: 1000 });

    // D. Captured here at 1000; Paystack says 1200.
    const d = await newOrder();
    await newAttempt(d.id, ref('D'), 'COMPLETED');
    await paymentsQueries.createLedgerEntry({ order_id: d.id, entry_type: 'PAYMENT_CAPTURED', direction: 'CREDIT', amount: 1000, currency: 'KES', reference: `${PAYSTACK}:${ref('D')}` });
    listed.push(listing(ref('D'), 'success', 1200));

    // E. Money in at Paystack under a reference we never issued.
    listed.push(listing(ref('E-UNKNOWN'), 'success', 500));

    // F. Captured here; Paystack has no such transaction.
    const f = await newOrder();
    await newAttempt(f.id, ref('F'), 'COMPLETED');
    await paymentsQueries.createLedgerEntry({ order_id: f.id, entry_type: 'PAYMENT_CAPTURED', direction: 'CREDIT', amount: 1000, currency: 'KES', reference: `${PAYSTACK}:${ref('F')}` });

    // G. The list says paid, verifying says otherwise: flag it, record nothing.
    const g = await newOrder();
    await newAttempt(g.id, ref('G'), 'FAILED');
    listed.push(listing(ref('G'), 'success'));
    verifyAnswers.set(ref('G'), { status: 'failed', amount: 1000 });

    // ── First run ────────────────────────────────────────────────────────────
    const first = await reconcilePaystackDay(DAY, { deps });
    check('the run completes and returns a summary', first !== null);

    check('A: missed payment recorded once in the ledger', (await captures(ref('A'))).n === 1 && (await captures(ref('A'))).total === 1000);
    check('A: order is now paid', (await stateOf(a.id)).endsWith('/PAID'), await stateOf(a.id));
    check('A: attempt marked COMPLETED', (await attemptStatus(ref('A'))) === 'COMPLETED');

    const bAfter = await stateOf(b.id);
    check('B: expired order started cancelled and unpaid', bBefore === 'CANCELLED/UNPAID', bBefore);
    check('B: late payment recorded and the order moved off unpaid', (await captures(ref('B'))).n === 1 && bAfter !== bBefore, bAfter);

    check('C: stale pending attempt settled as failed', (await attemptStatus(ref('C'))) === 'FAILED');
    check('C: no money recorded', (await captures(ref('C'))).n === 0);

    const issues = await sql<{ kind: string; reference: string }[]>`SELECT kind, reference FROM paystack_reconciliation_issues WHERE day = ${DAY} ORDER BY reference`;
    const has = (kind: string, reference: string) => issues.some((i) => i.kind === kind && i.reference === reference);
    check('D: amount mismatch flagged, ledger untouched', has('amount_mismatch', ref('D')) && (await captures(ref('D'))).total === 1000);
    check('E: unknown reference flagged', has('unknown_reference', ref('E-UNKNOWN')));
    check('F: capture missing at Paystack flagged', has('missing_at_paystack', ref('F')));
    check('G: verify disagreement flagged, nothing recorded', has('verify_disagrees', ref('G')) && (await captures(ref('G'))).n === 0);
    check('exactly four issues stored', issues.length === 4, JSON.stringify(issues));

    check('summary counts the two recovered payments', first?.recovered_payments.length === 2, JSON.stringify(first?.recovered_payments));
    check('one money alert sent for the day', alerts.length === 1 && alerts[0]!.audience === 'money' && alerts[0]!.title.includes('4 thing(s)'), alerts[0]?.title);

    const [run] = await sql`SELECT status, attempts FROM paystack_reconciliation_runs WHERE day = ${DAY}`;
    check('run recorded as COMPLETED', run?.status === 'COMPLETED');

    // ── Reruns ───────────────────────────────────────────────────────────────
    check('an unforced rerun of a completed day does nothing', (await reconcilePaystackDay(DAY, { deps })) === null);

    const again = await reconcilePaystackDay(DAY, { deps, force: true });
    check('a forced rerun recovers nothing new', again?.recovered_payments.length === 0, JSON.stringify(again));
    check('a forced rerun finds no new issues', again?.new_issues === 0 && again?.issues === 4, JSON.stringify(again));
    check('no second alert for the same findings', alerts.length === 1, String(alerts.length));
    check('no capture was duplicated', (await captures(ref('A'))).n === 1 && (await captures(ref('B'))).n === 1);

    // ── Paystack unreachable ─────────────────────────────────────────────────
    listFails = true;
    const failed = await reconcilePaystackDay(DAY, { deps, force: true }).then(() => false, () => true);
    const [failedRun] = await sql`SELECT status, error FROM paystack_reconciliation_runs WHERE day = ${DAY}`;
    check('a failed list throws and leaves the day FAILED for retry', failed && failedRun?.status === 'FAILED' && String(failedRun?.error).includes('503'));
    listFails = false;
    const retried = await reconcilePaystackDay(DAY, { deps });
    check('an unforced tick retries a FAILED day', retried !== null);
} finally {
    // ── Cleanup ──────────────────────────────────────────────────────────────
    await sql`DELETE FROM paystack_reconciliation_issues WHERE day = ${DAY}`;
    await sql`DELETE FROM paystack_reconciliation_runs WHERE day = ${DAY}`;
    if (orderIds.length) {
        const txIds = (await sql`SELECT id FROM payment_transactions WHERE order_id IN ${sql(orderIds)}`).map((r: any) => Number(r.id));
        if (txIds.length) await sql`DELETE FROM processed_payment_events WHERE payment_transaction_id IN ${sql(txIds)}`;
        await sql`DELETE FROM payment_ledger_entries WHERE order_id IN ${sql(orderIds)}`;
        await sql`DELETE FROM payment_transactions WHERE order_id IN ${sql(orderIds)}`;
        await sql`DELETE FROM audit_logs WHERE entity_type = 'order' AND entity_id IN ${sql(orderIds.map(String))}`;
        for (const id of orderIds) await sql`DELETE FROM in_app_notifications WHERE data->>'order_id' = ${String(id)}`;
        await sql`DELETE FROM orders WHERE id IN ${sql(orderIds)}`;
    }
    if (reservedKeys.length) {
        await sql`DELETE FROM email_outbox WHERE job_type = 'ZZ_TEST' AND dedupe_key IN ${sql(reservedKeys)}`;
    }
    await sql`DELETE FROM inventory_movements WHERE variant_id = ${V}`;
    await sql`DELETE FROM in_app_notifications WHERE data->>'variant_id' = ${String(V)}`;
    await sql`DELETE FROM products WHERE id = ${prod.id}`;
    await sql`DELETE FROM categories WHERE id = ${cat.id}`;
    const leftovers = (await sql`SELECT count(*)::int AS n FROM orders WHERE id IN ${sql(orderIds.length ? orderIds : [0])}`)[0].n;
    console.log(`cleanup: ${leftovers === 0 ? 'clean' : `${leftovers} orders left`}`);
    await closeDatabase();
}

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} reconciliation checks passed`);
if (failed.length) process.exit(1);
