/**
 * Integration checks for order/payment integrity against the dev database:
 * discount limits under concurrency, unpaid-order expiry, late payments, concurrent cancels,
 * per-customer order limits, and refunds against the payment ledger.
 * Creates its own throwaway product, codes and orders and deletes them afterwards.
 *
 *   bun run test:integration
 */
import 'dotenv/config';
import { sql } from '../lib/db';
import { ordersQueries } from '../features/orders/orders.queries';
import { paymentsQueries } from '../features/payments/payments.queries';
import { expireUnpaidOrders } from '../services/unpaid-order-expiry';
import { summariseOrderPayments } from '../features/payments/order-balance';
import { confirmOrderPayment } from '../services/order-payments';

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

const place = (phone: string, discountUsage?: { codeId: number; phone: string; amount: number }) =>
  ordersQueries.create(null,
    [{ variant_id: V, product_id: PRODUCT, quantity: 1, unit_price: 1000, variant_sku: 'ZZ-TEST-VAR', variant_size: null, variant_color: null }],
    1000, { full_name: 'ZZ Test', phone, address_line1: 'x', city: 'x', state: 'x', postal_code: '', country: 'Kenya' } as any,
    null, 0, undefined, discountUsage ? 'ZZ' : null, discountUsage ? 100 : 0, 'ZZ Test', phone, null,
    discountUsage ? { discountUsage } : undefined);

// Online checkout path with per-customer limits on (as the order handler does).
const placeLimited = (phone: string, email: string) =>
  ordersQueries.create(null,
    [{ variant_id: V, product_id: PRODUCT, quantity: 1, unit_price: 1000, variant_sku: 'ZZ-TEST-VAR', variant_size: null, variant_color: null }],
    1000, { full_name: 'ZZ Test', phone, address_line1: 'x', city: 'x', state: 'x', postal_code: '', country: 'Kenya' } as any,
    null, 0, undefined, null, 0, 'ZZ Test', phone, email,
    { customerLimits: { phone, email } });
const reason = (r: PromiseSettledResult<unknown>) => (r.status === 'rejected' ? (r.reason as Error).message : '');

try {
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

  // 4. late payment with stock available → reinstated, then paid
  const [expired] = await sql`SELECT o.id FROM orders o JOIN order_items i ON i.order_id = o.id WHERE i.variant_id = ${V} LIMIT 1`;
  const paidWhileCancelled = await paymentsQueries.markOrderPaid(Number(expired.id));
  check('cannot mark a cancelled order paid directly', paidWhileCancelled === false);
  const reinstated = await ordersQueries.reinstateCancelled(Number(expired.id));
  const paid = await paymentsQueries.markOrderPaid(Number(expired.id));
  const [after4] = await sql`SELECT status, payment_status FROM orders WHERE id = ${expired.id}`;
  check('late payment reinstates order and re-takes stock', reinstated && paid && after4.status === 'CONFIRMED' && (await stock(V)) === 2,
    `reinstated=${reinstated} paid=${paid} ${after4.status}/${after4.payment_status} stock=${await stock(V)}`);

  // 5. late payment with no stock → stays cancelled, recorded as paid for refund
  const orderB = await place('254700000009');
  await ordersQueries.cancelUnpaid(Number(orderB.id));
  await sql`UPDATE product_variants SET stock = 0 WHERE id = ${V}`;
  const reinstatedB = await ordersQueries.reinstateCancelled(Number(orderB.id));
  const refundMarked = await paymentsQueries.markCancelledOrderPaid(Number(orderB.id));
  const [afterB] = await sql`SELECT status, payment_status FROM orders WHERE id = ${orderB.id}`;
  check('late payment without stock → no oversell, flagged paid+cancelled', !reinstatedB && refundMarked && afterB.status === 'CANCELLED' && afterB.payment_status === 'PAID' && (await stock(V)) === 0,
    `reinstated=${reinstatedB} ${afterB.status}/${afterB.payment_status} stock=${await stock(V)}`);

  // 6. two cancels at once → stock restored exactly once
  await sql`UPDATE product_variants SET stock = 3 WHERE id = ${V}`;
  const orderC = await place('254700000010');
  const r6 = await Promise.all([ordersQueries.cancelUnpaid(Number(orderC.id)), ordersQueries.cancelUnpaid(Number(orderC.id))]);
  check('concurrent cancels restore stock once', r6.filter(Boolean).length === 1 && (await stock(V)) === 3, `wins=${r6} stock=${await stock(V)}`);
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
  for (const o of openOrders) await ordersQueries.cancelUnpaid(Number(o.id));
  const r9 = await Promise.allSettled([placeLimited(P, E)]);
  check('can order again after unpaid orders clear', r9[0]!.status === 'fulfilled', reason(r9[0]!));

  // 10. hourly cap: 5 orders in the hour, the 6th is refused even with none unpaid
  for (let i = 0; i < 2; i++) {
    for (const o of await sql`SELECT id FROM orders WHERE customer_phone = ${P} AND status = 'PENDING'`) await ordersQueries.cancelUnpaid(Number(o.id));
    await placeLimited(P, E);
  }
  for (const o of await sql`SELECT id FROM orders WHERE customer_phone = ${P} AND status = 'PENDING'`) await ordersQueries.cancelUnpaid(Number(o.id));
  const hourCount = (await sql`SELECT count(*)::int AS n FROM orders WHERE customer_phone = ${P}`)[0].n;
  const r10 = await Promise.allSettled([placeLimited(P, E)]);
  check('6th order in an hour is refused', hourCount === 5 && r10[0]!.status === 'rejected' && reason(r10[0]!).includes('last hour'), `orders this hour=${hourCount} result=${reason(r10[0]!) || 'accepted'}`);

  // 11. a refused order takes no stock
  const stockBefore11 = await stock(V);
  await Promise.allSettled([placeLimited(P, E)]);
  check('refused orders take no stock', (await stock(V)) === stockBefore11, `stock ${stockBefore11} → ${await stock(V)}`);
  // 12–17. refunds against the ledger
  const paidOrder = async (phone: string, total = 1000) => {
    const o = await place(phone);
    await paymentsQueries.markOrderPaid(Number(o.id));
    await paymentsQueries.createLedgerEntry({ order_id: Number(o.id), entry_type: 'PAYMENT_CAPTURED', direction: 'CREDIT', amount: total, currency: 'KES', reference: `zz-capture:${o.id}`, metadata: {} });
    return Number(o.id);
  };
  const refundOf = (orderId: number, amount: number, key: string) => paymentsQueries.recordRefund({
    orderId, amount, method: 'MPESA', reason: 'zz test', idempotencyKey: key, recordedBy: { id: '0' },
  });
  const summaryOf = async (orderId: number) => {
    const [o] = await sql`SELECT total_amount, status, payment_status FROM orders WHERE id = ${orderId}`;
    return { ...summariseOrderPayments(o, await paymentsQueries.findLedgerByOrderId(orderId)), status: o.status as string };
  };
  await sql`UPDATE product_variants SET stock = 20 WHERE id = ${V}`;

  const R = await paidOrder('254722000001');
  await refundOf(R, 400, `zz-r1-${R}`);
  const s12 = await summaryOf(R);
  check('partial refund → partially_refunded, status unchanged', s12.state === 'partially_refunded' && s12.net === 600 && s12.status === 'CONFIRMED', JSON.stringify(s12));

  const r13 = await Promise.allSettled([refundOf(R, 700, `zz-r2-${R}`)]);
  check('cannot refund more than remains', r13[0]!.status === 'rejected' && reason(r13[0]!).includes('600.00'), reason(r13[0]!));

  const r14 = await Promise.allSettled([refundOf(R, 600, `zz-r3a-${R}`), refundOf(R, 600, `zz-r3b-${R}`)]);
  const s14 = await summaryOf(R);
  check('two admins refunding at once → only one succeeds', r14.filter((r) => r.status === 'fulfilled').length === 1 && s14.refunded === 1000,
    `fulfilled=${r14.filter((r) => r.status === 'fulfilled').length} refunded=${s14.refunded}`);
  check('fully refunded → order marked REFUNDED, net 0', s14.state === 'refunded' && s14.net === 0 && s14.status === 'REFUNDED', JSON.stringify(s14));

  const R2 = await paidOrder('254722000002');
  const d1 = await refundOf(R2, 300, `zz-dup-${R2}`);
  const d2 = await refundOf(R2, 300, `zz-dup-${R2}`);
  const s15 = await summaryOf(R2);
  check('double-submit with the same key records one refund', d1.recorded && !d2.recorded && s15.refunded === 300, `first=${d1.recorded} second=${d2.recorded} refunded=${s15.refunded}`);

  const unpaid = await place('254722000003');
  const r16 = await Promise.allSettled([refundOf(Number(unpaid.id), 100, `zz-unpaid-${unpaid.id}`)]);
  check('unpaid orders cannot be refunded', r16[0]!.status === 'rejected' && reason(r16[0]!).includes('Only paid orders'), reason(r16[0]!));

  const late = await place('254722000004');
  await ordersQueries.cancelUnpaid(Number(late.id));
  await paymentsQueries.markCancelledOrderPaid(Number(late.id));
  await paymentsQueries.createLedgerEntry({ order_id: Number(late.id), entry_type: 'PAYMENT_CAPTURED', direction: 'CREDIT', amount: 1000, currency: 'KES', reference: `zz-capture:${late.id}`, metadata: {} });
  const owed = await summaryOf(Number(late.id));
  await refundOf(Number(late.id), 1000, `zz-late-${late.id}`);
  const settled = await summaryOf(Number(late.id));
  check('late payment: refund_owed → refunded, stays CANCELLED', owed.state === 'refund_owed' && settled.state === 'refunded' && settled.status === 'CANCELLED',
    `before=${owed.state} after=${settled.state}/${settled.status}`);
  // 18–21. amount check when a provider reports payment (no emails on this path)
  const under = await place('254744000001');
  const confirmedUnder = await confirmOrderPayment(Number(under.id), { amount: 800, currency: 'KES', reference: `zz-under:${under.id}` });
  const sUnder = await summaryOf(Number(under.id));
  check('underpaid payment is recorded but not confirmed', !confirmedUnder && sUnder.status === 'PENDING' && sUnder.captured === 800 && sUnder.state === 'underpaid',
    `confirmed=${confirmedUnder} ${sUnder.status} captured=${sUnder.captured} state=${sUnder.state}`);

  await sql`UPDATE orders SET created_at = now() - interval '2 hours' WHERE id = ${under.id}`;
  await expireUnpaidOrders();
  const [underAfter] = await sql`SELECT status FROM orders WHERE id = ${under.id}`;
  check('expiry leaves orders holding money for staff', underAfter.status === 'PENDING', underAfter.status);

  const wrongCurrency = await place('254744000002');
  const confirmedFx = await confirmOrderPayment(Number(wrongCurrency.id), { amount: 1000, currency: 'USD', reference: `zz-fx:${wrongCurrency.id}` });
  check('wrong currency is held, not confirmed', !confirmedFx && (await summaryOf(Number(wrongCurrency.id))).status === 'PENDING');

  const notes = await sql`SELECT count(*)::int AS n FROM in_app_notifications WHERE type = 'PAYMENT_MISMATCH' AND data->>'order_id' IN (${String(under.id)}, ${String(wrongCurrency.id)})`;
  // Alerts go to active admins (and the duty manager when handover is on).
  const staff = await sql`SELECT count(*)::int AS n FROM users WHERE is_active AND role = 'ADMIN'`;
  check('staff alerted about held payments', staff[0].n === 0 || notes[0].n > 0, `alerts=${notes[0].n} staff=${staff[0].n}`);

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
  check('shipping_address readable with ->>', (await sql`SELECT shipping_address->>'full_name' AS n FROM orders WHERE id = ${under.id}`)[0].n === 'ZZ Test');
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
  await sql`DELETE FROM discount_codes WHERE code IN ('ZZLIMIT1', 'ZZOPEN')`;
  await sql`DELETE FROM products WHERE id = ${PRODUCT}`;
  await sql`DELETE FROM categories WHERE id = ${cat.id}`;
  for (const [name, ok, detail] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  — ${detail}`}`);
  const leftovers = (await sql`SELECT (SELECT count(*) FROM products WHERE slug LIKE 'zz-test%')::int AS p, (SELECT count(*) FROM discount_codes WHERE code LIKE 'ZZ%')::int AS d`)[0];
  console.log('cleanup leftovers:', leftovers);
  await sql.end();
}
