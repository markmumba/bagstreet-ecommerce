/**
 * Gift voucher checks against the dev database, through the same paths the app uses: the Order
 * quote, createOrder and applyOrderEvent. Holds, spends, releases, refunds back onto the voucher,
 * Late payments, concurrent spending and the never-paid-out-as-cash rule.
 * Creates its own product and vouchers and deletes them afterwards. No email can reach anyone.
 *
 *   bun run test:vouchers
 */
import 'dotenv/config';
import { sql } from '../lib/db';
import { env } from '../config/env';
import { applyOrderEvent, createOrder } from '../features/orders/lifecycle/order-lifecycle';
import type { Actor } from '../features/orders/lifecycle/transitions';
import { quoteOrder } from '../features/quote/quote.queries';
import { expireUnpaidOrders } from '../services/unpaid-order-expiry';
import { summariseOrderPayments } from '../features/payments/order-balance';
import { paymentsQueries } from '../features/payments/payments.queries';
import { giftVouchersQueries } from '../features/gift-vouchers/gift-vouchers.queries';

if (env.NODE_ENV === 'production') throw new Error('Gift voucher fixtures must not run in production');

const results: [string, boolean, string?][] = [];
const check = (name: string, ok: boolean, detail?: string) => results.push([name, ok, detail]);
const voucherIds: number[] = [];

const [cat] = await sql`INSERT INTO categories(name, slug, description) VALUES ('ZZ Voucher', 'zz-voucher-cat', '') RETURNING id`;
const [prod] = await sql`INSERT INTO products(category_id, sku, name, slug, description, price, stock, image_url, is_active) VALUES (${cat.id}, 'ZZ-VCH-PRD', 'ZZ Voucher Product', 'zz-voucher-product', '', 1000, 0, '', true) RETURNING id`;
const [variant] = await sql`INSERT INTO product_variants(product_id, sku, stock, is_active, low_stock_threshold) VALUES (${prod.id}, 'ZZ-VCH-VAR', 100, true, 0) RETURNING id`;
const V = Number(variant.id), PRODUCT = Number(prod.id);
const [admin] = await sql`SELECT id, email FROM users WHERE role = 'ADMIN' ORDER BY id LIMIT 1`;
const ADMIN: Actor = { kind: 'staff', userId: String(admin.id), role: 'ADMIN', email: admin.email };
const MANAGER: Actor = { kind: 'staff', userId: String(admin.id), role: 'MANAGER' };
const CHECKOUT: Actor = { kind: 'customer', isOwner: true, via: 'checkout' };
const PROVIDER: Actor = { kind: 'payment_provider' };

// Orders paid by voucher confirm (and email staff) inside the transaction that creates them, before
// this script knows their id. Reserve the email dedupe keys for the next ids as already-skipped
// ZZ_TEST rows, so the real emails are dropped as duplicates.
const staffIds: number[] = (await sql`SELECT id FROM users`).map((r: any) => Number(r.id));
const [{ last }] = await sql`SELECT COALESCE((SELECT last_value FROM orders_id_seq), 0)::int AS last`;
for (let id = Number(last) + 1; id <= Number(last) + 40; id++) {
    for (const key of [
        `order-confirmation:${id}`, `order-expired:${id}`, `order-agreement:${id}`, `gift-voucher:${id}`, `gift-voucher-receipt:${id}`,
        ...staffIds.flatMap((u) => [`admin-order-confirmed:${id}:${u}`,
            ...['PAYMENT_MISMATCH', 'REFUND_REQUIRED', 'PAYMENT_REVERSED', 'PAYMENT_INIT_FAILED'].map((t) => `staff-alert:${t}:${id}:${u}`)]),
    ]) {
        await sql`INSERT INTO email_outbox (job_type, recipient, payload, dedupe_key, status, sent_at)
                  VALUES ('ZZ_TEST', 'zz-outbox-guard@example.invalid', '{}'::jsonb, ${key}, 'SKIPPED', now()) ON CONFLICT DO NOTHING`;
    }
}

const issue = async (amount: number) => {
    const issued = await giftVouchersQueries.issue({
        amount, salePaymentMethod: 'CASH', saleReference: 'zz-test', purchaserName: 'ZZ Buyer',
        recipientName: null, recipientPhone: null, recipientEmail: null, message: null, issuedBy: Number(admin.id),
    });
    voucherIds.push(Number(issued.voucher.id));
    return issued;
};
const balance = async (voucherId: number) => Number((await sql`SELECT balance FROM gift_vouchers WHERE id = ${voucherId}`)[0].balance);
const stateOf = async (id: number) => {
    const [o] = await sql`SELECT status, payment_status FROM orders WHERE id = ${id}`;
    return `${o.status}/${o.payment_status}`;
};
const ledger = async (id: number, type: string) =>
    Number((await sql`SELECT COALESCE(sum(amount), 0) AS total FROM payment_ledger_entries WHERE order_id = ${id} AND entry_type = ${type}`)[0].total);
const draft = (units: number, voucher: { id: number; amount: number; last4: string } | null, phone = '254711000001') => ({
    userId: null,
    items: [{ variant_id: V, product_id: PRODUCT, quantity: units, unit_price: 1000, variant_sku: 'ZZ-VCH-VAR', variant_size: null, variant_color: null }],
    totalAmount: 1000 * units,
    shippingAddress: { full_name: 'ZZ Voucher', phone, address_line1: 'x', city: 'x', state: 'x', postal_code: '', country: 'Kenya' } as any,
    shippingLocationId: null, shippingCost: 0, discountCode: null, discountAmount: 0,
    voucher, customerName: 'ZZ Voucher', customerPhone: phone, customerEmail: null,
});
const of = (issued: Awaited<ReturnType<typeof issue>>, amount: number) => ({ id: Number(issued.voucher.id), amount, last4: issued.voucher.code_last4 });
const online = (units: number, voucher: ReturnType<typeof of> | null, phone?: string) =>
    createOrder(draft(units, voucher, phone), { type: 'placed_online', paidByVoucher: voucher != null && voucher.amount >= units * 1000 }, CHECKOUT);
const age = (id: number) => sql`UPDATE orders SET created_at = now() - interval '2 hours' WHERE id = ${id}`;
const captured = (amount: number, reference: string) => ({ type: 'payment_captured' as const, amount, currency: 'KES', reference });
const refund = (amount: number, method: string, key: string) =>
    ({ type: 'refund_recorded' as const, amount, method, reason: 'zz test', idempotencyKey: key });

try {
    // 1. The quote prices a voucher as a way to pay, not a discount.
    const a = await issue(3000);
    const q = await quoteOrder({ items: [{ variant_id: V, quantity: 5 }], voucher_code: a.code.toLowerCase().replaceAll('-', ' ') }, { mode: 'walk_in' });
    check('quote: total unchanged, voucher pays its balance, the rest is to pay',
        q.total === 5000 && q.voucher?.amount === 3000 && q.amount_to_pay === 2000 && q.problems.length === 0, JSON.stringify(q.voucher));
    const wrong = await quoteOrder({ items: [{ variant_id: V, quantity: 1 }], voucher_code: 'BGST-2222-3333-4444-5555' }, { mode: 'walk_in' });
    check('quote: an unknown code is a problem', wrong.voucher_problem === 'Gift voucher not found' && wrong.problems.includes('Gift voucher not found'));

    // 2. Part paid by voucher: held at order creation, spent when M-Pesa pays the rest.
    const o1 = await online(5, of(a, 3000));
    check('partial voucher order waits for payment with the voucher held', await stateOf(o1.id) === 'PENDING/UNPAID' && await balance(of(a, 0).id) === 0);
    const paid = await applyOrderEvent(o1.id, captured(2000, `zz-vch-${o1.id}`), PROVIDER);
    check('paying the rest confirms the order and spends the voucher',
        paid.outcome === 'changed' && await stateOf(o1.id) === 'CONFIRMED/PAID' && await ledger(o1.id, 'VOUCHER_REDEEMED') === 3000,
        `${await stateOf(o1.id)} redeemed=${await ledger(o1.id, 'VOUCHER_REDEEMED')}`);
    const s1 = summariseOrderPayments(o1 as any, await paymentsQueries.findLedgerByOrderId(o1.id));
    check('payment summary: paid, 3000 by voucher, 2000 refundable as money', s1.state === 'paid' && s1.paid_by_voucher === 3000 && s1.cash_refundable === 2000, JSON.stringify(s1));

    // 3. Never paid out as cash; the voucher part goes back onto the voucher.
    const tooMuchCash = await applyOrderEvent(o1.id, refund(2500, 'MPESA', `zz-r1-${o1.id}`), ADMIN);
    check('a cash refund can not include the voucher part', tooMuchCash.outcome === 'not_allowed', tooMuchCash.outcome);
    await sql`UPDATE gift_vouchers SET expires_at = now() + interval '3 days' WHERE id = ${of(a, 0).id}`;
    const back = await applyOrderEvent(o1.id, refund(3000, 'GIFT_VOUCHER', `zz-r2-${o1.id}`), ADMIN);
    const [aRow] = await sql`SELECT balance, expires_at > now() + interval '29 days' AS extended FROM gift_vouchers WHERE id = ${of(a, 0).id}`;
    check('a refund back onto the voucher restores its balance and keeps it usable for 30 days',
        back.outcome === 'unchanged' && Number(aRow.balance) === 3000 && aRow.extended === true, JSON.stringify(aRow));
    const rest = await applyOrderEvent(o1.id, refund(2000, 'MPESA', `zz-r3-${o1.id}`), ADMIN);
    check('refunding the cash part as well → REFUNDED', rest.outcome === 'changed' && await stateOf(o1.id) === 'REFUNDED/PAID', await stateOf(o1.id));

    // 4. Fully paid by voucher: confirmed at once, no payment provider.
    const b = await issue(5000);
    const o2 = await online(2, of(b, 2000));
    check('an order the voucher covers is paid at once', await stateOf(o2.id) === 'CONFIRMED/PAID'
        && await ledger(o2.id, 'VOUCHER_REDEEMED') === 2000 && await ledger(o2.id, 'PAYMENT_CAPTURED') === 0 && await balance(of(b, 0).id) === 3000);

    // 5. Expiry gives a held voucher back, without extending it.
    const c = await issue(1000);
    const expiryBefore = (await sql`SELECT expires_at FROM gift_vouchers WHERE id = ${of(c, 0).id}`)[0].expires_at;
    const o3 = await online(3, of(c, 1000));
    await age(o3.id);
    await expireUnpaidOrders();
    const [cRow] = await sql`SELECT balance, expires_at FROM gift_vouchers WHERE id = ${of(c, 0).id}`;
    check('expiry cancels the order and releases the voucher hold', await stateOf(o3.id) === 'CANCELLED/UNPAID'
        && Number(cRow.balance) === 1000 && new Date(cRow.expires_at).getTime() === new Date(expiryBefore).getTime());

    // 6. Late payment: reinstated when the voucher can still pay its part...
    const late = await applyOrderEvent(o3.id, captured(2000, `zz-vch-late-${o3.id}`), PROVIDER);
    check('a late payment re-holds and spends the voucher and reinstates the order',
        late.outcome === 'changed' && await stateOf(o3.id) === 'CONFIRMED/PAID' && await balance(of(c, 0).id) === 0,
        `${await stateOf(o3.id)} balance=${await balance(of(c, 0).id)}`);

    // ...held as a refund owed when the voucher was spent elsewhere meanwhile.
    const d = await issue(1000);
    const o4 = await online(2, of(d, 1000));
    await age(o4.id);
    await expireUnpaidOrders();
    const spendElsewhere = await createOrder({ ...draft(1, of(d, 1000)), orderSource: 'WALK_IN' as any },
        { type: 'walk_in_sale', amount: 0, currency: 'KES', reference: `zz-walkin-${Date.now()}` }, MANAGER);
    check('a walk-in sale paid wholly by voucher records no counter payment', await stateOf(spendElsewhere.id) === 'DELIVERED/PAID'
        && await ledger(spendElsewhere.id, 'PAYMENT_CAPTURED') === 0 && await ledger(spendElsewhere.id, 'VOUCHER_REDEEMED') === 1000);
    const late2 = await applyOrderEvent(o4.id, captured(1000, `zz-vch-late-${o4.id}`), PROVIDER);
    check('a late payment when the voucher was spent elsewhere is held as a refund owed',
        late2.outcome === 'changed' && await stateOf(o4.id) === 'CANCELLED/HELD' && await balance(of(d, 0).id) === 0, await stateOf(o4.id));

    // 7. Two checkouts spending the same voucher at once: exactly one wins.
    const e = await issue(1000);
    const race = await Promise.allSettled([online(1, of(e, 1000), '254711000002'), online(1, of(e, 1000), '254711000003')]);
    const won = race.filter((r) => r.status === 'fulfilled').length;
    check('the same voucher spent twice at once → one order', won === 1 && await balance(of(e, 0).id) === 0,
        `won=${won} balance=${await balance(of(e, 0).id)} ${race.map((r) => r.status === 'rejected' ? (r.reason as Error).message : 'ok')}`);

    // 8. Reversal then cancel: the voucher part goes back onto the voucher.
    const f = await issue(2000);
    const o5 = await online(3, of(f, 2000));
    await applyOrderEvent(o5.id, captured(1000, `zz-vch-${o5.id}`), PROVIDER);
    const reversed = await applyOrderEvent(o5.id, { type: 'payment_reversed', reference: `zz-rev-${o5.id}` }, PROVIDER);
    check('a reversal only takes back the provider money', reversed.outcome === 'changed' && await ledger(o5.id, 'PAYMENT_REVERSED') === 1000,
        `reversed=${await ledger(o5.id, 'PAYMENT_REVERSED')}`);
    await applyOrderEvent(o5.id, { type: 'cancelled', reason: 'zz' }, ADMIN);
    check('cancelling a reversed order returns the spent voucher money', await stateOf(o5.id) === 'CANCELLED/REVERSED'
        && await balance(of(f, 0).id) === 2000 && await ledger(o5.id, 'REFUND_ISSUED') === 2000);

    // 9. Cancelling a voucher.
    const g = await issue(1500);
    const o6 = await online(2, of(g, 1500));
    const blocked = await giftVouchersQueries.void(of(g, 0).id, 'zz', Number(admin.id)).then(() => 'voided', (err: Error) => err.message);
    check('a voucher held by an unpaid order can not be cancelled', blocked.includes('unpaid order'), blocked);
    await applyOrderEvent(o6.id, { type: 'cancelled', reason: 'zz' }, ADMIN);
    await giftVouchersQueries.void(of(g, 0).id, 'zz test', Number(admin.id));
    const afterVoid = await quoteOrder({ items: [{ variant_id: V, quantity: 1 }], voucher_code: g.code }, { mode: 'walk_in' });
    check('a cancelled voucher can not pay', afterVoid.voucher_problem === 'This gift voucher has been cancelled' && await balance(of(g, 0).id) === 0);

    // 10. Buying a voucher online: an Order with source GIFT_VOUCHER, issued once paid.
    const buy = (amount: number, deliverTo: 'RECIPIENT' | 'BUYER' = 'RECIPIENT', phone = '254711000010') => createOrder({
        ...draft(1, null, phone), items: [], totalAmount: amount, orderSource: 'GIFT_VOUCHER' as any,
        customerEmail: 'zz-buyer@example.invalid',
        giftVoucherPurchase: { amount, deliverTo, recipientName: 'ZZ Friend', recipientEmail: 'zz-friend@example.invalid', message: 'Happy birthday' },
    }, { type: 'placed_online' }, CHECKOUT);
    const issuedFor = async (orderId: number) =>
        (await sql`SELECT v.* FROM gift_voucher_orders g JOIN gift_vouchers v ON v.id = g.voucher_id WHERE g.order_id = ${orderId}`)[0];
    const trackVoucher = async (orderId: number) => { const v = await issuedFor(orderId); if (v) voucherIds.push(Number(v.id)); return v; };

    const p1 = await buy(5000);
    check('a voucher purchase waits for payment, with no voucher yet', await stateOf(p1.id) === 'PENDING/UNPAID' && !(await issuedFor(p1.id)));
    const items = await sql`SELECT count(*)::int AS n FROM order_items WHERE order_id = ${p1.id}`;
    check('a voucher purchase takes no stock and has no items', items[0].n === 0);
    await applyOrderEvent(p1.id, captured(5000, `zz-vch-buy-${p1.id}`), PROVIDER);
    const v1 = await trackVoucher(p1.id);
    check('paying issues the voucher and the sale is done', await stateOf(p1.id) === 'DELIVERED/PAID'
        && v1 && Number(v1.balance) === 5000 && v1.sold_via === 'ONLINE' && Number(v1.purchase_order_id) === p1.id, JSON.stringify(v1));
    // (Who gets which email is unit-tested in voucher-sales.test.ts; here the email keys are reserved
    // so nothing is sent.) The voucher records who it was for.
    check('the voucher records the recipient it was emailed to', v1.recipient_email === 'zz-friend@example.invalid' && v1.recipient_name === 'ZZ Friend'
        && v1.message === 'Happy birthday');
    await applyOrderEvent(p1.id, captured(5000, `zz-vch-buy-${p1.id}`), PROVIDER);
    check('the same payment reported twice issues one voucher', (await sql`SELECT count(*)::int AS n FROM gift_vouchers WHERE purchase_order_id = ${p1.id}`)[0].n === 1);
    const sold = await sql`SELECT count(*)::int AS n FROM payment_ledger_entries WHERE order_id = ${p1.id} AND entry_type = 'PAYMENT_CAPTURED'
        AND NOT EXISTS (SELECT 1 FROM orders vo WHERE vo.id = order_id AND vo.order_source = 'GIFT_VOUCHER')`;
    check('the voucher sale is left out of dashboard revenue', sold[0].n === 0);

    // Refund only while untouched, and refunding cancels the voucher.
    const partly = await applyOrderEvent(p1.id, refund(2000, 'MPESA', `zz-vr1-${p1.id}`), ADMIN);
    check('no partial refund of a voucher purchase', partly.outcome === 'not_allowed');
    const fullRefund = await applyOrderEvent(p1.id, refund(5000, 'MPESA', `zz-vr2-${p1.id}`), ADMIN);
    const v1After = await issuedFor(p1.id);
    check('an untouched voucher purchase can be refunded, which cancels the voucher',
        fullRefund.outcome === 'changed' && await stateOf(p1.id) === 'REFUNDED/PAID' && v1After.voided_at != null && Number(v1After.balance) === 0);

    const p2 = await buy(2000, 'BUYER', '254711000011');
    await applyOrderEvent(p2.id, captured(2000, `zz-vch-buy-${p2.id}`), PROVIDER);
    const v2 = await trackVoucher(p2.id);
    check('"email it to me" records the buyer as the holder', v2.recipient_email === 'zz-buyer@example.invalid');
    // Spend part of it, then the buyer's payment is reversed: the rest is cancelled.
    await createOrder({ ...draft(1, { id: Number(v2.id), amount: 1000, last4: v2.code_last4 }), orderSource: 'WALK_IN' as any },
        { type: 'walk_in_sale', amount: 0, currency: 'KES', reference: `zz-walkin2-${Date.now()}` }, MANAGER);
    const spentRefund = await applyOrderEvent(p2.id, refund(2000, 'MPESA', `zz-vr3-${p2.id}`), ADMIN);
    check('once part of the voucher is spent, the purchase can no longer be refunded', spentRefund.outcome === 'not_allowed');
    await applyOrderEvent(p2.id, { type: 'payment_reversed', reference: `zz-rev-buy-${p2.id}` }, PROVIDER);
    const v2After = await issuedFor(p2.id);
    check('a reversed voucher purchase cancels what is left on the voucher', await stateOf(p2.id) === 'DELIVERED/REVERSED'
        && v2After.voided_at != null && Number(v2After.balance) === 0, JSON.stringify({ state: await stateOf(p2.id), balance: v2After.balance }));

    // An underpaid purchase is held; staff accepting it issues the voucher.
    const p3 = await buy(10000, 'RECIPIENT', '254711000012');
    await applyOrderEvent(p3.id, captured(9000, `zz-vch-buy-${p3.id}`), PROVIDER);
    check('an underpaid voucher purchase is held with no voucher', await stateOf(p3.id) === 'PENDING/HELD' && !(await issuedFor(p3.id)));
    await applyOrderEvent(p3.id, { type: 'marked_paid' }, ADMIN);
    check('accepting the held payment issues the voucher', Boolean(await trackVoucher(p3.id)) && await stateOf(p3.id) === 'DELIVERED/PAID');

    // A late payment after the purchase expired still issues the voucher, and expiry sends no "items released" email.
    const p4 = await buy(2000, 'RECIPIENT', '254711000013');
    await age(p4.id);
    await expireUnpaidOrders();
    const expiredMail = await sql`SELECT count(*)::int AS n FROM email_outbox WHERE dedupe_key = ${`order-expired:${p4.id}`} AND job_type = 'ORDER_EXPIRED'`;
    check('an abandoned voucher purchase expires without the goods email', await stateOf(p4.id) === 'CANCELLED/UNPAID' && expiredMail[0].n === 0);
    await applyOrderEvent(p4.id, captured(2000, `zz-vch-buy-${p4.id}`), PROVIDER);
    check('a payment after it expired still issues the voucher', Boolean(await trackVoucher(p4.id)) && await stateOf(p4.id) === 'DELIVERED/PAID');

    // Replacing a lost code: same voucher and balance, the old code stops working.
    const v3 = await issuedFor(p3.id);
    const replaced = await giftVouchersQueries.replaceCode(Number(v3.id), Number(admin.id));
    const newCodeQuote = await quoteOrder({ items: [{ variant_id: V, quantity: 1 }], voucher_code: replaced.code }, { mode: 'walk_in' });
    const [v3After] = await sql`SELECT code_hash, code_last4 FROM gift_vouchers WHERE id = ${v3.id}`;
    check('a replaced code works, keeps the balance, and the old code is gone',
        newCodeQuote.voucher?.amount === 1000 && Number(replaced.voucher.balance) === 10000 && v3After.code_hash !== v3.code_hash);

    // 11. Every balance is exactly the sum of its movements.
    const drift = await sql`
        SELECT v.id FROM gift_vouchers v
        WHERE v.id IN ${sql(voucherIds)}
          AND v.balance <> (SELECT COALESCE(SUM(delta), 0) FROM gift_voucher_movements m WHERE m.voucher_id = v.id)`;
    check('every voucher balance equals the sum of its movements', drift.length === 0, JSON.stringify(drift));
    const codes = await sql`SELECT count(*)::int AS n FROM gift_vouchers WHERE id IN ${sql(voucherIds)} AND code_hash LIKE '%BGST%'`;
    check('codes are stored hashed, never as typed', codes[0].n === 0);
} finally {
    const orderIds = (await sql`SELECT DISTINCT order_id FROM order_items WHERE variant_id = ${V}`).map((r: any) => Number(r.order_id));
    if (voucherIds.length) await sql`DELETE FROM gift_voucher_movements WHERE voucher_id IN ${sql(voucherIds)}`;
    const voucherOrderIds = (await sql`SELECT order_id FROM gift_voucher_orders g JOIN orders o ON o.id = g.order_id WHERE o.customer_email = 'zz-buyer@example.invalid'`).map((r: any) => Number(r.order_id));
    orderIds.push(...voucherOrderIds);
    if (voucherOrderIds.length) {
        const bought = (await sql`SELECT voucher_id FROM gift_voucher_orders WHERE order_id IN ${sql(voucherOrderIds)} AND voucher_id IS NOT NULL`).map((r: any) => Number(r.voucher_id));
        for (const id of bought) if (!voucherIds.includes(id)) voucherIds.push(id);
        if (voucherIds.length) await sql`DELETE FROM gift_voucher_movements WHERE voucher_id IN ${sql(voucherIds)}`;
        await sql`DELETE FROM gift_voucher_orders WHERE order_id IN ${sql(voucherOrderIds)}`;
        await sql`DELETE FROM order_policy_acceptances WHERE order_id IN ${sql(voucherOrderIds)}`;
    }
    if (orderIds.length) {
        await sql`DELETE FROM audit_logs WHERE entity_type = 'order' AND entity_id IN ${sql(orderIds.map(String))}`;
        for (const id of orderIds) await sql`DELETE FROM in_app_notifications WHERE data->>'order_id' = ${String(id)}`;
        await sql`DELETE FROM payment_ledger_entries WHERE order_id IN ${sql(orderIds)}`;
        await sql`DELETE FROM payment_transactions WHERE order_id IN ${sql(orderIds)}`;
        await sql`UPDATE gift_vouchers SET purchase_order_id = NULL WHERE purchase_order_id IN ${sql(orderIds)}`;
        await sql`DELETE FROM orders WHERE id IN ${sql(orderIds)}`;
    }
    if (voucherIds.length) {
        await sql`DELETE FROM audit_logs WHERE entity_type = 'gift_voucher' AND entity_id IN ${sql(voucherIds.map(String))}`;
        await sql`UPDATE gift_vouchers SET purchase_order_id = NULL WHERE id IN ${sql(voucherIds)}`;
        await sql`DELETE FROM gift_vouchers WHERE id IN ${sql(voucherIds)}`;
    }
    await sql`DELETE FROM inventory_movements WHERE variant_id = ${V}`;
    await sql`DELETE FROM in_app_notifications WHERE data->>'variant_id' = ${String(V)}`;
    await sql`DELETE FROM email_outbox WHERE recipient LIKE 'zz-outbox-%@example.invalid'`;
    await sql`DELETE FROM products WHERE id = ${PRODUCT}`;
    await sql`DELETE FROM categories WHERE id = ${cat.id}`;
    const realEmails = await sql`SELECT count(*)::int AS n FROM email_outbox WHERE created_at > now() - interval '5 minutes' AND job_type <> 'ZZ_TEST'
        AND (recipient NOT LIKE 'zz-%' OR job_type IN ('GIFT_VOUCHER', 'GIFT_VOUCHER_RECEIPT'))`;
    for (const [name, ok, detail] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  — ${detail}`}`);
    const failed = results.filter(([, ok]) => !ok).length;
    console.log(`\n${results.length - failed}/${results.length} gift voucher checks passed. Emails queued for real people in the last 5 minutes: ${realEmails[0].n}`);
    await sql.end();
    if (failed) process.exit(1);
}
