/**
 * Integration checks for order/payment integrity against the dev database:
 * discount limits under concurrency, unpaid-order expiry, concurrent cancels, per-customer order
 * limits, the email outbox, and the Order lifecycle — payments, late payments, reversals, staff and
 * customer actions and refunds, all through applyOrderEvent as the app does.
 * Creates its own throwaway product, codes and orders and deletes them afterwards.
 *
 *   bun run test:integration
 */
import 'dotenv/config';
import { sql } from '../lib/db';
import { paymentsQueries } from '../features/payments/payments.queries';
import { expireUnpaidOrders } from '../services/unpaid-order-expiry';
import { summariseOrderPayments } from '../features/payments/order-balance';
import { enqueueEmail, processEmailOutboxBatch } from '../services/email-outbox';
import type { EmailJob } from '../services/email-jobs';
import { applyOrderEvent, createOrder } from '../features/orders/lifecycle/order-lifecycle';
import { inventory, InsufficientStockError } from '../features/inventory/inventory';
import { AfterCommit } from '../lib/after-commit';
import { quoteOrder } from '../features/quote/quote.queries';
import { staffFor } from '../features/staff-alerts/staff-alerts';
import type { Actor } from '../features/orders/lifecycle/transitions';

const results: [string, boolean, string?][] = [];
const check = (name: string, ok: boolean, detail?: string) => results.push([name, ok, detail]);
const stock = async (v: number) => (await sql`SELECT stock FROM product_variants WHERE id = ${v}`)[0].stock as number;
const used = async (c: number) => (await sql`SELECT used_count FROM discount_codes WHERE id = ${c}`)[0].used_count as number;

const [cat] = await sql`INSERT INTO categories(name, slug, description) VALUES ('ZZ Test', 'zz-test-cat', '') RETURNING id`;
const [prod] = await sql`INSERT INTO products(category_id, sku, name, slug, description, price, stock, image_url, is_active) VALUES (${cat.id}, 'ZZ-TEST-PRD', 'ZZ Test Product', 'zz-test-product', '', 1000, 0, '', true) RETURNING id`;
const [variant] = await sql`INSERT INTO product_variants(product_id, sku, stock, is_active) VALUES (${prod.id}, 'ZZ-TEST-VAR', 3, true) RETURNING id`;
const [limited] = await sql`INSERT INTO discount_codes(code, value, min_order_amount, usage_limit, is_active) VALUES ('ZZLIMIT1', 10, 0, 1, true) RETURNING id`;
const [open] = await sql`INSERT INTO discount_codes(code, value, min_order_amount, is_active) VALUES ('ZZOPEN', 10, 0, true) RETURNING id`;
const V = Number(variant.id), PRODUCT = Number(prod.id);
// Taking stock can raise low-stock alerts. Reserve their email dedupe keys (today and tomorrow, in
// case the run spans midnight UTC) so no real low-stock email reaches staff; notifications are removed at the end.
// Staff emails can never go out from this script: for every order it creates, and for the test
// variant's low-stock alerts, the email dedupe keys are reserved first as already-skipped ZZ_TEST rows,
// so the real emails are dropped as duplicates. (Notifications are removed at the end.)
const staffIds: number[] = (await sql`SELECT id FROM users`).map((r: any) => Number(r.id));
const reserveEmailKeys = async (keys: string[]) => {
  for (const key of keys) {
    await sql`
      INSERT INTO email_outbox (job_type, recipient, payload, dedupe_key, status, sent_at)
      VALUES ('ZZ_TEST', 'zz-outbox-guard@example.invalid', '{}'::jsonb, ${key}, 'SKIPPED', now())
      ON CONFLICT DO NOTHING`;
  }
};
const MONEY_ALERTS = ['PAYMENT_MISMATCH', 'REFUND_REQUIRED', 'PAYMENT_REVERSED', 'PAYMENT_INIT_FAILED'];
const guardEmails = async (orderId: number) => reserveEmailKeys([
  `order-confirmation:${orderId}`,
  ...staffIds.flatMap((id) => [
    `admin-order-confirmed:${orderId}:${id}`,
    ...MONEY_ALERTS.map((type) => `staff-alert:${type}:${orderId}:${id}`),
  ]),
]);
await reserveEmailKeys([0, 1].flatMap((offset) => {
  const day = new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  return ['low', 'out'].flatMap((level) => staffIds.map((id) => `low-stock:${V}:${day}:${level}:${id}`));
}));

// Orders are created the way the app creates them: through the Order lifecycle.
const CHECKOUT: Actor = { kind: 'customer', isOwner: true, via: 'checkout' };
const codeNames = new Map([[Number(limited.id), 'ZZLIMIT1'], [Number(open.id), 'ZZOPEN']]);
const draft = (phone: string, quantity: number, email: string | null = null) => ({
  userId: null,
  items: [{ variant_id: V, product_id: PRODUCT, quantity, unit_price: 1000, variant_sku: 'ZZ-TEST-VAR', variant_size: null, variant_color: null }],
  totalAmount: 1000 * quantity,
  shippingAddress: { full_name: 'ZZ Test', phone, address_line1: 'x', city: 'x', state: 'x', postal_code: '', country: 'Kenya' } as any,
  shippingLocationId: null, shippingCost: 0, discountCode: null as string | null, discountAmount: 0,
  customerName: 'ZZ Test', customerPhone: phone, customerEmail: email,
});
const guarded = async (created: Promise<Awaited<ReturnType<typeof createOrder>>>) => {
  const order = await created;
  await guardEmails(Number(order.id));
  return order;
};
const place = (phone: string, discount?: { codeId: number; phone: string; amount: number }, quantity = 1) =>
  guarded(createOrder({
    ...draft(phone, quantity),
    ...(discount ? { discountCode: codeNames.get(discount.codeId)!, discountAmount: discount.amount } : {}),
  }, { type: 'placed_online' }, CHECKOUT));

// Online checkout path with per-customer limits on (as the order handler does).
const placeLimited = (phone: string, email: string) =>
  guarded(createOrder({ ...draft(phone, 1, email), customerLimits: { phone, email } }, { type: 'placed_online' }, CHECKOUT));
const reason = (r: PromiseSettledResult<unknown>) => (r.status === 'rejected' ? (r.reason as Error).message : '');

try {
  // Every order change goes through the Order lifecycle, as the app does.
  const PROVIDER: Actor = { kind: 'payment_provider' };
  const SYSTEM: Actor = { kind: 'system' };
  const stateOf = async (id: number) => {
    const [o] = await sql`SELECT status, payment_status FROM orders WHERE id = ${id}`;
    return `${o.status}/${o.payment_status}`;
  };
  const ledger = async (id: number, type: string) =>
    (await sql`SELECT count(*)::int AS n, COALESCE(sum(amount), 0)::float AS total FROM payment_ledger_entries WHERE order_id = ${id} AND entry_type = ${type}`)[0] as { n: number; total: number };
  const realEmailsFor = async (id: number) =>
    (await sql`SELECT count(*)::int AS n FROM email_outbox WHERE recipient NOT LIKE 'zz-outbox-%' AND (dedupe_key LIKE ${`%:${id}`} OR dedupe_key LIKE ${`%:${id}:%`})`)[0].n as number;
  const captured = (amount: number, reference: string, currency = 'KES') =>
    ({ type: 'payment_captured' as const, amount, currency, reference });
  const [anyAdmin] = await sql`SELECT id, email FROM users WHERE role = 'ADMIN' ORDER BY id LIMIT 1`;
  const ADMIN: Actor = { kind: 'staff', userId: String(anyAdmin?.id ?? 0), role: 'ADMIN', email: anyAdmin?.email };
  const MANAGER: Actor = { kind: 'staff', userId: String(anyAdmin?.id ?? 0), role: 'MANAGER' };
  const cancel = (id: number) => applyOrderEvent(id, { type: 'cancelled' }, ADMIN);

  // 1. usage_limit = 1, two phones at once → exactly one order, used_count 1
  const r1 = await Promise.allSettled([
    place('254700000001', { codeId: Number(limited.id), phone: '254700000001', amount: 100 }),
    place('254700000002', { codeId: Number(limited.id), phone: '254700000002', amount: 100 }),
  ]);
  const ok1 = r1.filter((r) => r.status === 'fulfilled').length;
  const orders1 = (await sql`SELECT count(*)::int AS n FROM order_items WHERE variant_id = ${V}`)[0].n;
  check('usage_limit=1 under concurrency → 1 order', ok1 === 1 && orders1 === 1 && (await used(Number(limited.id))) === 1,
    `fulfilled=${ok1} orders=${orders1} used=${await used(Number(limited.id))} reason=${(r1.find((r) => r.status === 'rejected') as any)?.reason?.message}`);
  check('rejected order took no stock', (await stock(V)) === 2, `stock=${await stock(V)}`);

  // 2. same phone twice at once (no limit) → one order
  const r2 = await Promise.allSettled([
    place('254700000003', { codeId: Number(open.id), phone: '254700000003', amount: 100 }),
    place('254700000003', { codeId: Number(open.id), phone: '254700000003', amount: 100 }),
  ]);
  const ok2 = r2.filter((r) => r.status === 'fulfilled').length;
  check('same phone + code concurrently → 1 order', ok2 === 1 && (await used(Number(open.id))) === 1,
    `fulfilled=${ok2} used=${await used(Number(open.id))} stock=${await stock(V)}`);

  // 3. expiry releases stock and the discount use
  await sql`UPDATE orders SET created_at = now() - interval '2 hours' WHERE id IN (SELECT order_id FROM order_items WHERE variant_id = ${V})`;
  const before = await stock(V);
  const run = await expireUnpaidOrders();
  const statuses = (await sql`SELECT DISTINCT o.status FROM orders o JOIN order_items i ON i.order_id = o.id WHERE i.variant_id = ${V}`).map((r: any) => r.status);
  check('expiry cancels unpaid orders and restores stock', statuses.join() === 'CANCELLED' && (await stock(V)) === 3,
    `run=${JSON.stringify(run)} stock ${before}→${await stock(V)} statuses=${statuses}`);
  check('expiry releases discount uses', (await used(Number(limited.id))) === 0 && (await used(Number(open.id))) === 0,
    `limited=${await used(Number(limited.id))} open=${await used(Number(open.id))}`);
  const run2 = await expireUnpaidOrders();
  check('second expiry run is a no-op', run2.cancelled === 0 && (await stock(V)) === 3, JSON.stringify(run2));

  // 6. two cancels at once → stock restored exactly once
  await sql`UPDATE product_variants SET stock = 3 WHERE id = ${V}`;
  const orderC = await place('254700000010');
  const r6 = await Promise.all([cancel(Number(orderC.id)), cancel(Number(orderC.id))]);
  const wins6 = r6.filter((r) => r.outcome === 'changed').length;
  check('concurrent cancels restore stock once', wins6 === 1 && (await stock(V)) === 3, `wins=${wins6} stock=${await stock(V)}`);
  // 7. three orders at once from one phone → only 2 unpaid allowed
  await sql`UPDATE product_variants SET stock = 20 WHERE id = ${V}`;
  const P = '254711000001', E = 'zz-limits@example.com';
  const r7 = await Promise.allSettled([placeLimited(P, E), placeLimited(P, E), placeLimited(P, E)]);
  const ok7 = r7.filter((r) => r.status === 'fulfilled').length;
  const why7 = r7.map(reason).find(Boolean) ?? '';
  check('max 2 unpaid per customer, even concurrently', ok7 === 2 && why7.includes('unpaid orders'), `fulfilled=${ok7} reason=${why7}`);

  // 8. same email (different case) with a new phone is still the same customer
  const r8 = await Promise.allSettled([placeLimited('254711000002', 'ZZ-Limits@Example.com')]);
  check('limit also applies by email, case-insensitively', r8[0]!.status === 'rejected' && reason(r8[0]!).includes('unpaid orders'), reason(r8[0]!));

  // 9. once unpaid orders are cancelled the customer can order again
  const openOrders = await sql`SELECT id FROM orders WHERE customer_phone = ${P} AND status = 'PENDING'`;
  for (const o of openOrders) await cancel(Number(o.id));
  const r9 = await Promise.allSettled([placeLimited(P, E)]);
  check('can order again after unpaid orders clear', r9[0]!.status === 'fulfilled', reason(r9[0]!));

  // 10. hourly cap: 5 orders in the hour, the 6th is refused even with none unpaid
  for (let i = 0; i < 2; i++) {
    for (const o of await sql`SELECT id FROM orders WHERE customer_phone = ${P} AND status = 'PENDING'`) await cancel(Number(o.id));
    await placeLimited(P, E);
  }
  for (const o of await sql`SELECT id FROM orders WHERE customer_phone = ${P} AND status = 'PENDING'`) await cancel(Number(o.id));
  const hourCount = (await sql`SELECT count(*)::int AS n FROM orders WHERE customer_phone = ${P}`)[0].n;
  const r10 = await Promise.allSettled([placeLimited(P, E)]);
  check('6th order in an hour is refused', hourCount === 5 && r10[0]!.status === 'rejected' && reason(r10[0]!).includes('last hour'), `orders this hour=${hourCount} result=${reason(r10[0]!) || 'accepted'}`);

  // 11. a refused order takes no stock
  const stockBefore11 = await stock(V);
  await Promise.allSettled([placeLimited(P, E)]);
  check('refused orders take no stock', (await stock(V)) === stockBefore11, `stock ${stockBefore11} → ${await stock(V)}`);
  // 22–28. email outbox. Test rows use an unknown email type, so even if the running dev server's
  // worker picks one up, the sender rejects it and no real email can go out.
  const testJob = (n: string) => ({ type: 'ZZ_TEST', to: `zz-outbox-${n}@example.invalid`, name: 'ZZ' } as unknown as EmailJob);
  const outboxRow = async (n: string) => (await sql`SELECT id, status, attempts, last_error, sent_at, next_attempt_at, now() AS db_now FROM email_outbox WHERE recipient = ${`zz-outbox-${n}@example.invalid`}`)[0];
  // Park rows in the future so the dev server's worker leaves them alone, then make one due just before claiming it.
  const dueNow = async (ids: number[]) => { await sql`UPDATE email_outbox SET next_attempt_at = now() WHERE id IN ${sql(ids)}`; };
  const enqueueParked = async (n: string, dedupeKey?: string) => {
    const ok = await sql.begin(async (tx: typeof sql) => {
      const inserted = await enqueueEmail(testJob(n), { tx, dedupeKey });
      await tx`UPDATE email_outbox SET next_attempt_at = now() + interval '1 day' WHERE recipient = ${`zz-outbox-${n}@example.invalid`}`;
      return inserted;
    });
    return ok as unknown as boolean;
  };

  await Promise.allSettled([sql.begin(async (tx: typeof sql) => { await enqueueEmail(testJob('rollback'), { tx }); throw new Error('roll back'); })]);
  check('email queued in a rolled-back transaction leaves no trace', !(await outboxRow('rollback')));

  const firstKey = await enqueueParked('dedupe', 'zz-dedupe-key');
  const secondKey = await enqueueParked('dedupe-2', 'zz-dedupe-key');
  check('same dedupe key queues one email', firstKey && !secondKey && !(await outboxRow('dedupe-2')), `first=${firstKey} second=${secondKey}`);

  const sent: string[] = [];
  const okSend = async (job: EmailJob) => { sent.push(job.to); };
  const okRow = await outboxRow('dedupe');
  await dueNow([okRow.id]);
  const r24 = await processEmailOutboxBatch({ send: okSend, onlyIds: [Number(okRow.id)] });
  const after24 = await outboxRow('dedupe');
  check('successful send → SENT after 1 attempt', r24.sent === 1 && after24.status === 'SENT' && after24.attempts === 1 && after24.sent_at != null, JSON.stringify({ r24, status: after24.status, attempts: after24.attempts }));

  await enqueueParked('retry');
  const retryId = Number((await outboxRow('retry')).id);
  const failSend = async () => { throw new Error('SMTP 421 busy password=hunter2'); };
  await dueNow([retryId]);
  await processEmailOutboxBatch({ send: failSend, onlyIds: [retryId] });
  const retry1 = await outboxRow('retry');
  const delaySec = Math.round((new Date(retry1.next_attempt_at).getTime() - new Date(retry1.db_now).getTime()) / 1000);
  check('failed send → retried in ~1 minute, error kept without secrets', retry1.status === 'PENDING' && retry1.attempts === 1 && delaySec >= 55 && delaySec <= 65 && retry1.last_error.includes('password=***') && !retry1.last_error.includes('hunter2'),
    JSON.stringify({ status: retry1.status, attempts: retry1.attempts, delaySec, err: retry1.last_error }));
  for (let i = 0; i < 5; i++) { await dueNow([retryId]); await processEmailOutboxBatch({ send: failSend, onlyIds: [retryId] }); }
  const retry6 = await outboxRow('retry');
  const alerts = await sql`SELECT count(*)::int AS n FROM in_app_notifications WHERE type = 'EMAIL_FAILED' AND data->>'outbox_id' = ${String(retryId)}`;
  check('gives up after 6 attempts and alerts admins', retry6.status === 'FAILED' && retry6.attempts === 6 && alerts[0].n > 0, JSON.stringify({ status: retry6.status, attempts: retry6.attempts, alerts: alerts[0].n }));

  await enqueueParked('crash');
  const crashId = Number((await outboxRow('crash')).id);
  await sql`UPDATE email_outbox SET status = 'SENDING', attempts = 1, locked_until = now() - interval '1 minute' WHERE id = ${crashId}`;
  await processEmailOutboxBatch({ send: okSend, onlyIds: [crashId] });
  const crash = await outboxRow('crash');
  check('email abandoned by a crashed worker is sent later', crash.status === 'SENT' && crash.attempts === 2, JSON.stringify({ status: crash.status, attempts: crash.attempts }));

  for (let i = 0; i < 10; i++) await enqueueParked(`conc-${i}`);
  const concIds = (await sql`SELECT id FROM email_outbox WHERE recipient LIKE 'zz-outbox-conc-%'`).map((r: any) => Number(r.id));
  const sends = new Map<string, number>();
  const countingSend = async (job: EmailJob) => { await new Promise((r) => setTimeout(r, 20)); sends.set(job.to, (sends.get(job.to) ?? 0) + 1); };
  await dueNow(concIds);
  const [wa, wb] = await Promise.all([
    processEmailOutboxBatch({ send: countingSend, onlyIds: concIds, limit: 10 }),
    processEmailOutboxBatch({ send: countingSend, onlyIds: concIds, limit: 10 }),
  ]);
  const dupes = [...sends.values()].filter((n) => n > 1).length;
  check('two workers at once: every email sent exactly once', sends.size === 10 && dupes === 0 && wa.sent + wb.sent === 10, `sent=${sends.size} dupes=${dupes} split=${wa.sent}/${wb.sent}`);

  // 29–40. Order lifecycle: the paths Pesapal and the expiry job now take.
  // Confirming a payment queues "order confirmed" emails to real staff. Reserve those dedupe keys
  // first (as already-skipped test rows), so the lifecycle's emails are dropped as duplicates.
  await sql`UPDATE product_variants SET stock = 20 WHERE id = ${V}`;

  const L1 = Number((await place('254755000001')).id);
  await guardEmails(L1);
  const l1 = await applyOrderEvent(L1, captured(1000, `zz-l1:${L1}`), PROVIDER);
  check('lifecycle: full payment → CONFIRMED/PAID with one capture', l1.outcome === 'changed' && (await stateOf(L1)) === 'CONFIRMED/PAID' && (await ledger(L1, 'PAYMENT_CAPTURED')).n === 1,
    `${l1.outcome} ${await stateOf(L1)} captures=${(await ledger(L1, 'PAYMENT_CAPTURED')).n}`);
  const l1again = await applyOrderEvent(L1, captured(1000, `zz-l1:${L1}`), PROVIDER);
  check('lifecycle: same provider report twice changes nothing', l1again.outcome === 'unchanged' && (await ledger(L1, 'PAYMENT_CAPTURED')).n === 1, l1again.outcome);
  const l1fail = await applyOrderEvent(L1, { type: 'payment_failed', attemptReference: `zz-l1-fail:${L1}` }, PROVIDER);
  check('lifecycle: a failure report after payment leaves the order paid', l1fail.outcome === 'unchanged' && (await stateOf(L1)) === 'CONFIRMED/PAID', await stateOf(L1));

  const l1rev = await applyOrderEvent(L1, { type: 'payment_reversed', reference: `zz-l1-rev:${L1}` }, PROVIDER);
  const revAlerts = (await sql`SELECT count(*)::int AS n FROM in_app_notifications WHERE type = 'PAYMENT_REVERSED' AND data->>'order_id' = ${String(L1)}`)[0].n;
  check('lifecycle: reversal → REVERSED (not FAILED), money out recorded, staff alerted', l1rev.outcome === 'changed' && (await stateOf(L1)) === 'CONFIRMED/REVERSED'
    && (await ledger(L1, 'PAYMENT_REVERSED')).total === 1000 && (staffIds.length === 0 || revAlerts > 0),
    `${await stateOf(L1)} reversed=${(await ledger(L1, 'PAYMENT_REVERSED')).total} alerts=${revAlerts}`);
  check('lifecycle: no real email queued by these tests', (await realEmailsFor(L1)) === 0, `rows=${await realEmailsFor(L1)}`);

  const L2 = Number((await place('254755000002')).id);
  const l2 = await applyOrderEvent(L2, captured(800, `zz-l2:${L2}`), PROVIDER);
  check('lifecycle: underpaid → PENDING/HELD, money recorded', l2.outcome === 'changed' && (await stateOf(L2)) === 'PENDING/HELD' && (await ledger(L2, 'PAYMENT_CAPTURED')).total === 800, await stateOf(L2));
  await sql`UPDATE orders SET created_at = now() - interval '2 hours' WHERE id = ${L2}`;
  await expireUnpaidOrders();
  check('lifecycle: expiry leaves a held order alone', (await stateOf(L2)) === 'PENDING/HELD', await stateOf(L2));
  const LFX = Number((await place('254755000006')).id);
  await applyOrderEvent(LFX, captured(1000, `zz-lfx:${LFX}`, 'USD'), PROVIDER);
  check('lifecycle: wrong currency is held, not confirmed', (await stateOf(LFX)) === 'PENDING/HELD', await stateOf(LFX));
  const heldAlerts = (await sql`SELECT count(*)::int AS n FROM in_app_notifications WHERE type = 'PAYMENT_MISMATCH' AND data->>'order_id' IN (${String(L2)}, ${String(LFX)})`)[0].n;
  check('lifecycle: staff alerted about held payments', staffIds.length === 0 || heldAlerts >= 2, `alerts=${heldAlerts}`);
  const [moneyStaff] = await sql`SELECT count(DISTINCT recipient_id)::int AS n FROM in_app_notifications WHERE type = 'PAYMENT_MISMATCH' AND data->>'order_id' = ${String(L2)}`;
  const expectedMoneyStaff = (await staffFor('money')).length;
  check('staff alerts: money problems go to admins only', moneyStaff.n === expectedMoneyStaff, `got=${moneyStaff.n} expected=${expectedMoneyStaff}`);

  // Late payment with stock: expiry gives back stock and the discount; the payment takes both again.
  const L3 = Number((await place('254755000003', { codeId: Number(open.id), phone: '254755000003', amount: 100 })).id);
  await sql`UPDATE orders SET discount_code = 'ZZOPEN' WHERE id = ${L3}`;
  const usedBefore = await used(Number(open.id));
  const stockBefore = await stock(V);
  const l3exp = await applyOrderEvent(L3, { type: 'expired' }, SYSTEM);
  const afterExpiry = { state: await stateOf(L3), stock: await stock(V), used: await used(Number(open.id)) };
  check('lifecycle: expiry → CANCELLED, stock and discount use released', l3exp.outcome === 'changed' && afterExpiry.state === 'CANCELLED/UNPAID'
    && afterExpiry.stock === stockBefore + 1 && afterExpiry.used === usedBefore - 1, JSON.stringify(afterExpiry));
  await guardEmails(L3);
  const l3pay = await applyOrderEvent(L3, captured(1000, `zz-l3:${L3}`), PROVIDER);
  const afterLate = { state: await stateOf(L3), stock: await stock(V), used: await used(Number(open.id)) };
  check('lifecycle: late payment reinstates, re-takes stock and re-claims the discount', l3pay.outcome === 'changed' && afterLate.state === 'CONFIRMED/PAID'
    && afterLate.stock === stockBefore && afterLate.used === usedBefore, JSON.stringify(afterLate));

  // Late payment without stock: no oversell, money kept on record as a refund owed.
  const L4 = Number((await place('254755000004')).id);
  await applyOrderEvent(L4, { type: 'expired' }, SYSTEM);
  await sql`UPDATE product_variants SET stock = 0 WHERE id = ${V}`;
  const l4 = await applyOrderEvent(L4, captured(1000, `zz-l4:${L4}`), PROVIDER);
  const refundAlerts = (await sql`SELECT count(*)::int AS n FROM in_app_notifications WHERE type = 'REFUND_REQUIRED' AND data->>'order_id' = ${String(L4)}`)[0].n;
  check('lifecycle: late payment without stock → CANCELLED/PAID, no oversell, refund flagged', l4.outcome === 'changed' && (await stateOf(L4)) === 'CANCELLED/PAID'
    && (await stock(V)) === 0 && (staffIds.length === 0 || refundAlerts > 0), `${await stateOf(L4)} stock=${await stock(V)} alerts=${refundAlerts}`);
  await applyOrderEvent(L4, { type: 'refund_recorded', amount: 1000, method: 'MPESA', reason: 'zz late', idempotencyKey: `zz-l4:${L4}` }, ADMIN);
  const [l4row] = await sql`SELECT total_amount, status, payment_status FROM orders WHERE id = ${L4}`;
  const l4money = summariseOrderPayments(l4row, await paymentsQueries.findLedgerByOrderId(L4));
  check('lifecycle: refund owed after a late payment settles, order stays cancelled', l4money.state === 'refunded' && (await stateOf(L4)) === 'CANCELLED/PAID',
    `${l4money.state} ${await stateOf(L4)}`);

  // Payment and expiry racing on the same order: whichever wins, stock is taken exactly once.
  await sql`UPDATE product_variants SET stock = 5 WHERE id = ${V}`;
  const L5 = Number((await place('254755000005')).id);
  await guardEmails(L5);
  await Promise.all([
    applyOrderEvent(L5, { type: 'expired' }, SYSTEM),
    applyOrderEvent(L5, captured(1000, `zz-l5:${L5}`), PROVIDER),
  ]);
  check('lifecycle: payment racing expiry → paid, stock taken exactly once', (await stateOf(L5)) === 'CONFIRMED/PAID' && (await stock(V)) === 4,
    `${await stateOf(L5)} stock=${await stock(V)}`);
  check('lifecycle: still no real email queued', (await realEmailsFor(L3)) + (await realEmailsFor(L5)) === 0);

  // 41–48. Staff and customer actions (step 3) through the lifecycle.
  await sql`UPDATE product_variants SET stock = 10 WHERE id = ${V}`;

  const A1 = Number((await place('254766000001')).id);
  const a1stranger = await applyOrderEvent(A1, { type: 'cancelled' }, { kind: 'customer', isOwner: false, via: 'account' });
  const a1manager = await applyOrderEvent(A1, { type: 'cancelled' }, MANAGER);
  check('actions: strangers and managers cannot cancel', a1stranger.outcome === 'not_allowed' && a1manager.outcome === 'not_allowed' && (await stateOf(A1)) === 'PENDING/UNPAID',
    `${a1stranger.outcome}/${a1manager.outcome} ${await stateOf(A1)}`);
  const a1 = await applyOrderEvent(A1, { type: 'cancelled' }, { kind: 'customer', isOwner: true, via: 'account' });
  check('actions: owner cancels unpaid order, stock returned', a1.outcome === 'changed' && (await stateOf(A1)) === 'CANCELLED/UNPAID' && (await stock(V)) === 10, `${await stateOf(A1)} stock=${await stock(V)}`);

  const A2 = Number((await place('254766000002')).id);
  await applyOrderEvent(A2, captured(700, `zz-a2:${A2}`), PROVIDER);
  const a2customer = await applyOrderEvent(A2, { type: 'cancelled' }, { kind: 'customer', isOwner: true, via: 'account' });
  await guardEmails(A2);
  const a2 = await applyOrderEvent(A2, { type: 'marked_paid' }, ADMIN);
  check('actions: customer cannot cancel a held order; admin accepts it without a second capture', a2customer.outcome === 'not_allowed' && a2.outcome === 'changed'
    && (await stateOf(A2)) === 'CONFIRMED/PAID' && (await ledger(A2, 'PAYMENT_CAPTURED')).n === 1, `${a2customer.outcome} ${await stateOf(A2)} captures=${(await ledger(A2, 'PAYMENT_CAPTURED')).n}`);
  const a2cancel = await applyOrderEvent(A2, { type: 'cancelled' }, ADMIN);
  check('actions: paid order cannot be cancelled (refund instead)', a2cancel.outcome === 'not_allowed' && a2cancel.reason === 'refund_instead');
  const a2delivered = await applyOrderEvent(A2, { type: 'delivered' }, { kind: 'customer', isOwner: true, via: 'received_link' });
  check('actions: customer confirms receipt via email link', a2delivered.outcome === 'changed' && (await stateOf(A2)) === 'DELIVERED/PAID', await stateOf(A2));

  const A3 = Number((await place('254766000003')).id);
  await applyOrderEvent(A3, captured(500, `zz-a3:${A3}`), PROVIDER);
  const stockBeforeA3 = await stock(V);
  const a3 = await applyOrderEvent(A3, { type: 'cancelled', reason: 'zz short payment' }, ADMIN);
  check('actions: admin cancels a held order → refund owed, stock returned', a3.outcome === 'changed' && (await stateOf(A3)) === 'CANCELLED/HELD' && (await stock(V)) === stockBeforeA3 + 1,
    `${await stateOf(A3)} stock ${stockBeforeA3}→${await stock(V)}`);

  const A4 = Number((await place('254766000004')).id);
  await guardEmails(A4);
  await applyOrderEvent(A4, captured(1000, `zz-a4:${A4}`), PROVIDER);
  await applyOrderEvent(A4, { type: 'payment_reversed', reference: `zz-a4-rev:${A4}` }, PROVIDER);
  const a4wo = await applyOrderEvent(A4, { type: 'written_off', note: 'zz goods delivered, chargeback lost' }, ADMIN);
  const woAudit = (await sql`SELECT count(*)::int AS n FROM audit_logs WHERE entity_type = 'order' AND entity_id = ${String(A4)} AND action = 'ORDER_REVERSAL_WRITTEN_OFF'`)[0].n;
  check('actions: write-off keeps the order reversed and audits the note', a4wo.outcome === 'unchanged' && (await stateOf(A4)) === 'CONFIRMED/REVERSED' && woAudit === 1, `${await stateOf(A4)} audits=${woAudit}`);
  const stockBeforeA4 = await stock(V);
  await applyOrderEvent(A4, { type: 'cancelled' }, ADMIN);
  check('actions: cancel after reversal restocks', (await stateOf(A4)) === 'CANCELLED/REVERSED' && (await stock(V)) === stockBeforeA4 + 1, `${await stateOf(A4)} stock ${stockBeforeA4}→${await stock(V)}`);
  check('actions: no real email queued', (await realEmailsFor(A2)) + (await realEmailsFor(A4)) === 0);

  // 49–56. Refunds through the lifecycle (step 4).
  const refund = (amount: number, key: string) => ({ type: 'refund_recorded' as const, amount, method: 'MPESA', reason: 'zz test', idempotencyKey: key });
  const moneyOf = async (id: number) => {
    const [o] = await sql`SELECT total_amount, status, payment_status FROM orders WHERE id = ${id}`;
    return summariseOrderPayments(o, await paymentsQueries.findLedgerByOrderId(id));
  };
  await sql`UPDATE product_variants SET stock = 10 WHERE id = ${V}`;

  const F1 = Number((await place('254777000001')).id);
  await guardEmails(F1);
  await applyOrderEvent(F1, captured(1000, `zz-f1:${F1}`), PROVIDER);
  const f1a = await applyOrderEvent(F1, refund(400, `zz-f1-a:${F1}`), ADMIN);
  const f1again = await applyOrderEvent(F1, refund(400, `zz-f1-a:${F1}`), ADMIN);
  check('refunds: partial refund recorded once, even if submitted twice', f1a.outcome === 'unchanged' && !f1a.noop && f1again.outcome === 'unchanged' && f1again.noop
    && (await moneyOf(F1)).refunded === 400 && (await stateOf(F1)) === 'CONFIRMED/PAID', `refunded=${(await moneyOf(F1)).refunded} ${await stateOf(F1)}`);
  const f1over = await applyOrderEvent(F1, refund(700, `zz-f1-b:${F1}`), ADMIN);
  check('refunds: cannot refund more than remains', f1over.outcome === 'not_allowed' && f1over.reason === 'exceeds_refundable' && f1over.message.includes('600.00'),
    f1over.outcome === 'not_allowed' ? f1over.message : f1over.outcome);
  const f1race = await Promise.all([
    applyOrderEvent(F1, refund(600, `zz-f1-c:${F1}`), ADMIN),
    applyOrderEvent(F1, refund(600, `zz-f1-d:${F1}`), ADMIN),
  ]);
  check('refunds: two admins at once → only one succeeds, order REFUNDED', f1race.filter((r) => r.outcome === 'changed').length === 1
    && f1race.filter((r) => r.outcome === 'not_allowed').length === 1 && (await moneyOf(F1)).net === 0 && (await stateOf(F1)) === 'REFUNDED/PAID',
    `${f1race.map((r) => r.outcome)} net=${(await moneyOf(F1)).net} ${await stateOf(F1)}`);
  check('refunds: managers cannot refund', (await applyOrderEvent(F1, refund(1, `zz-f1-m:${F1}`), MANAGER)).outcome === 'not_allowed');

  const F2 = Number((await place('254777000002')).id);
  await applyOrderEvent(F2, captured(600, `zz-f2:${F2}`), PROVIDER);
  const f2pending = await applyOrderEvent(F2, refund(600, `zz-f2-a:${F2}`), ADMIN);
  await applyOrderEvent(F2, { type: 'cancelled' }, ADMIN);
  const f2 = await applyOrderEvent(F2, refund(600, `zz-f2-b:${F2}`), ADMIN);
  check('refunds: held order is cancelled first, then the refund owed settles and it stays cancelled', f2pending.outcome === 'not_allowed' && f2.outcome === 'unchanged'
    && (await stateOf(F2)) === 'CANCELLED/HELD' && (await moneyOf(F2)).state === 'refunded', `${f2pending.outcome} ${await stateOf(F2)} ${(await moneyOf(F2)).state}`);

  const F3 = Number((await place('254777000003')).id);
  await guardEmails(F3);
  await applyOrderEvent(F3, captured(1000, `zz-f3:${F3}`), PROVIDER);
  await applyOrderEvent(F3, refund(300, `zz-f3-a:${F3}`), ADMIN);
  await applyOrderEvent(F3, { type: 'payment_reversed', reference: `zz-f3-rev:${F3}` }, PROVIDER);
  const f3money = await moneyOf(F3);
  const f3refund = await applyOrderEvent(F3, refund(100, `zz-f3-b:${F3}`), ADMIN);
  check('refunds: reversal after a partial refund takes back the rest; nothing more can be refunded', f3money.reversed === 700 && f3money.net === 0
    && f3money.state === 'reversed' && f3refund.outcome === 'not_allowed', JSON.stringify({ reversed: f3money.reversed, net: f3money.net, state: f3money.state, refund: f3refund.outcome }));
  check('refunds: no real email queued', (await realEmailsFor(F1)) + (await realEmailsFor(F3)) === 0);
  // JSONB writes must store objects, not double-encoded strings, so SQL JSON operators work.
  const testOrderIds = (await sql`SELECT DISTINCT order_id FROM order_items WHERE variant_id = ${V}`).map((r: any) => Number(r.order_id));
  const [jsonTypes] = await sql`
    SELECT
      (SELECT array_agg(DISTINCT jsonb_typeof(shipping_address)) FROM orders WHERE id IN ${sql(testOrderIds)}) AS shipping,
      (SELECT array_agg(DISTINCT jsonb_typeof(metadata)) FROM payment_ledger_entries WHERE order_id IN ${sql(testOrderIds)} AND metadata IS NOT NULL) AS ledger,
      (SELECT array_agg(DISTINCT jsonb_typeof(data)) FROM in_app_notifications WHERE data->>'order_id' IN ${sql(testOrderIds.map(String))}) AS notifications,
      (SELECT array_agg(DISTINCT jsonb_typeof(after_state)) FROM audit_logs WHERE entity_type = 'order' AND entity_id IN ${sql(testOrderIds.map(String))} AND after_state IS NOT NULL) AS audit`;
  const onlyObjects = (types: string[] | null) => !types || types.every((t) => t === 'object');
  check('jsonb columns store objects', ['shipping', 'ledger', 'notifications', 'audit'].every((k) => onlyObjects(jsonTypes[k])), JSON.stringify(jsonTypes));
  check('shipping_address readable with ->>', (await sql`SELECT shipping_address->>'full_name' AS n FROM orders WHERE id = ${L2}`)[0].n === 'ZZ Test');

  // Inventory: locks, the zero floor, the movement log and threshold-crossing alerts.
  const adjust = (delta: number) => sql.begin(async (tx: typeof sql) => {
    const after = new AfterCommit();
    await inventory.adjust(tx, V, delta, 'ADMIN_ADJUSTMENT', { note: 'zz test' }, after);
  });
  await sql`UPDATE product_variants SET stock = 2, low_stock_threshold = 5 WHERE id = ${V}`;
  const race = await Promise.allSettled([adjust(-2), adjust(-2)]);
  const raceErrors = race.filter((r) => r.status === 'rejected').map((r) => (r as PromiseRejectedResult).reason);
  check('inventory: two adjustments racing → one wins, the other gets a clear 400, stock 0',
    raceErrors.length === 1 && raceErrors[0] instanceof InsufficientStockError && raceErrors[0].message.includes('out of stock') && (await stock(V)) === 0,
    `errors=${raceErrors.map((e) => `${e?.constructor?.name}: ${e?.message}`)} stock=${await stock(V)}`);

  const lowAlerts = async () => (await sql`SELECT count(*)::int AS n FROM in_app_notifications WHERE type = 'LOW_STOCK' AND data->>'variant_id' = ${String(V)}`)[0].n as number;
  await adjust(6);
  const lowBefore = await lowAlerts();
  const I1 = Number((await place('254788000001')).id);
  const lowAfterCrossing = await lowAlerts();
  await place('254788000002');
  const lowAfterSecond = await lowAlerts();
  check('inventory: low-stock alert only when the threshold is crossed (6 → 5), not again at 4',
    staffIds.length === 0 || (lowAfterCrossing > lowBefore && lowAfterSecond === lowAfterCrossing),
    `before=${lowBefore} crossing=${lowAfterCrossing} again=${lowAfterSecond}`);

  const short = await Promise.allSettled([place('254788000003', undefined, 9)]);
  check('inventory: an order larger than the stock is refused with a readable message, nothing taken',
    short[0]!.status === 'rejected' && reason(short[0]!).includes('Only 4 left') && (await stock(V)) === 4, `${reason(short[0]!)} stock=${await stock(V)}`);

  const [movementSum] = await sql`SELECT COALESCE(SUM(delta), 0)::int AS n FROM inventory_movements WHERE reference_id = ${I1} AND variant_id = ${V}`;
  check('inventory: the order\'s stock movement is logged against it', movementSum.n === -1, `sum=${movementSum.n}`);
  check('inventory: no real low-stock email queued', (await sql`SELECT count(*)::int AS n FROM email_outbox WHERE dedupe_key LIKE ${`low-stock:${V}:%`} AND recipient NOT LIKE 'zz-outbox-%'`)[0].n === 0);
  const [stockStaff] = await sql`SELECT count(DISTINCT recipient_id)::int AS n FROM in_app_notifications WHERE type = 'LOW_STOCK' AND data->>'variant_id' = ${String(V)}`;
  const expectedStockStaff = (await staffFor('stock')).length;
  check('staff alerts: stock alerts reach the stock audience (admins + duty manager)', stockStaff.n === expectedStockStaff, `got=${stockStaff.n} expected=${expectedStockStaff}`);

  // Order quote: one calculation for checkout, order creation and walk-ins.
  await sql`UPDATE product_variants SET stock = 10, low_stock_threshold = 0 WHERE id = ${V}`;
  const [zzArea] = await sql`INSERT INTO shipping_locations (name, price, is_active) VALUES ('ZZ Test Area', 250, true) RETURNING id`;
  const ZZ_AREA = Number(zzArea.id);
  const q1 = await quoteOrder({ items: [{ variant_id: V, quantity: 2 }], discount_code: 'zzopen', phone: '254799000001', shipping_location_id: ZZ_AREA });
  check('quote: 2 × 1000, 10% code (rounded down), delivery 250 → 2050, nothing blocking',
    q1.subtotal === 2000 && q1.discount?.amount === 200 && q1.delivery?.cost === (q1.qualifies_for_free_delivery ? 0 : 250)
      && q1.total === 1800 + (q1.qualifies_for_free_delivery ? 0 : 250) && q1.problems.length === 0,
    JSON.stringify({ subtotal: q1.subtotal, discount: q1.discount, delivery: q1.delivery, total: q1.total, problems: q1.problems }));
  const q2 = await quoteOrder({ items: [{ variant_id: V, quantity: 1 }], discount_code: 'NOPE-ZZ', phone: '254799000001', shipping_location_id: ZZ_AREA });
  check('quote: unknown code → no discount, a reason, order blocked', q2.discount === null && q2.discount_problem === 'Discount code was not found' && q2.problems.includes('Discount code was not found'));
  const q3 = await quoteOrder({ items: [{ variant_id: V, quantity: 1 }], discount_code: 'ZZOPEN', phone: '254799000001' }, { mode: 'walk_in' });
  check('quote: walk-ins refuse codes and need no delivery', q3.discount === null && q3.problems.length === 1 && q3.total === 1000, JSON.stringify(q3.problems));

  // The code expires between the quote and the order: the locked re-check refuses it.
  await sql`UPDATE discount_codes SET expires_at = now() - interval '1 minute' WHERE id = ${open.id}`;
  const expiredAtLock = await Promise.allSettled([place('254799000002', { codeId: Number(open.id), phone: '254799000002', amount: 100 })]);
  check('quote: a code that expired after the quote is refused when the order is created', expiredAtLock[0]!.status === 'rejected' && reason(expiredAtLock[0]!).includes('expired'), reason(expiredAtLock[0]!));
  await sql`UPDATE discount_codes SET expires_at = NULL WHERE id = ${open.id}`;
  await sql`DELETE FROM shipping_locations WHERE id = ${ZZ_AREA}`;
} catch (err) {
  check('script error', false, String(err));
} finally {
  const orderIds = (await sql`SELECT DISTINCT order_id FROM order_items WHERE variant_id = ${V}`).map((r: any) => Number(r.order_id));
  if (orderIds.length) {
    await sql`DELETE FROM audit_logs WHERE entity_type = 'order' AND entity_id IN ${sql(orderIds.map(String))}`;
    for (const id of orderIds) {
      await sql`DELETE FROM in_app_notifications WHERE data->>'order_id' = ${String(id)}`;
    }
    await sql`DELETE FROM payment_ledger_entries WHERE order_id IN ${sql(orderIds)}`;
    await sql`DELETE FROM discount_code_usages WHERE order_id IN ${sql(orderIds)}`;
    await sql`DELETE FROM orders WHERE id IN ${sql(orderIds)}`;
  }
  await sql`DELETE FROM inventory_movements WHERE variant_id = ${V}`;
  await sql`DELETE FROM in_app_notifications WHERE data->>'variant_id' = ${String(V)}`;
  await sql`DELETE FROM discount_codes WHERE code IN ('ZZLIMIT1', 'ZZOPEN')`;
  await sql`DELETE FROM shipping_locations WHERE name = 'ZZ Test Area'`;
  const outboxIds = (await sql`SELECT id FROM email_outbox WHERE recipient LIKE 'zz-outbox-%@example.invalid'`).map((r: any) => String(r.id));
  if (outboxIds.length) await sql`DELETE FROM in_app_notifications WHERE type = 'EMAIL_FAILED' AND data->>'outbox_id' IN ${sql(outboxIds)}`;
  await sql`DELETE FROM email_outbox WHERE recipient LIKE 'zz-outbox-%@example.invalid' OR dedupe_key = 'zz-dedupe-key'`;
  await sql`DELETE FROM products WHERE id = ${PRODUCT}`;
  await sql`DELETE FROM categories WHERE id = ${cat.id}`;
  for (const [name, ok, detail] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  — ${detail}`}`);
  const leftovers = (await sql`SELECT (SELECT count(*) FROM products WHERE slug LIKE 'zz-test%')::int AS p, (SELECT count(*) FROM discount_codes WHERE code LIKE 'ZZ%')::int AS d, (SELECT count(*) FROM email_outbox WHERE recipient LIKE 'zz-outbox-%')::int AS e`)[0];
  console.log('cleanup leftovers:', leftovers);
  await sql.end();
}
