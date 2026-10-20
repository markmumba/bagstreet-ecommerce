/**
 * Recommendation checks against the dev database, through the real routes: bought-together counts
 * (paid orders only, from the minimum), staff picks, category pairings, the bag, recently viewed,
 * admin validation and the per-day counts. Creates its own categories, products and orders, puts
 * back any pairings and counts it changed, and deletes the rest. Sends no email.
 *
 *   bun run test:recommendations
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { sql, closeDatabase } from '../lib/db';
import { env } from '../config/env';
import type { AppEnv } from '../lib/hono';
import { errorHandler } from '../middleware/error-handler';
import recommendationsRoutes from '../features/recommendations/recommendations.routes';
import { recommendationsQueries } from '../features/recommendations/recommendations.queries';
import { MIN_BOUGHT_TOGETHER } from '../features/recommendations/recommend';
import { toJsonbParam } from '../lib/json-column';

if (env.NODE_ENV === 'production') throw new Error('Recommendation fixtures must not run in production');

const results: [string, boolean, string?][] = [];
const check = (name: string, ok: boolean, detail?: string) => results.push([name, ok, detail]);

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route('/api/recommendations', recommendationsRoutes);

const tag = randomUUID().slice(0, 8);
const categoryIds: number[] = [];
const productIds: number[] = [];
const orderIds: number[] = [];
const userIds: number[] = [];
let statsBefore: Map<string, { impressions: number; clicks: number }> | null = null;

const call = async (method: string, path: string, body?: unknown, bearer?: string) => {
    const response = await app.request(`/api/recommendations${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = response.status === 204 ? null : await response.json().catch(() => null) as any;
    return { status: response.status, data: json?.data, message: json?.message as string | undefined };
};
const names = (list: any[] | undefined) => (list ?? []).map((p: any) => p.name as string);
const category = async (name: string, parentId: number | null = null) => {
    const [row] = await sql`INSERT INTO categories(name, slug, description, parent_id) VALUES (${`ZZ ${name} ${tag}`}, ${`zz-${name.toLowerCase()}-${tag}`}, '', ${parentId}) RETURNING id`;
    categoryIds.push(Number(row.id));
    return Number(row.id);
};
const product = async (name: string, categoryId: number, price: number, stock = 5, color = 'Black', active = true) => {
    const [row] = await sql`INSERT INTO products(category_id, sku, name, slug, description, price, stock, image_url, is_active)
        VALUES (${categoryId}, ${`ZZ-REC-${tag}-${productIds.length}`}, ${`ZZ ${name}`}, ${`zz-rec-${tag}-${productIds.length}`}, '', ${price}, 0, '', ${active}) RETURNING id`;
    await sql`INSERT INTO product_variants(product_id, sku, color, stock, is_active) VALUES (${row.id}, ${`ZZ-REC-${tag}-${productIds.length}-V`}, ${color}, ${stock}, true)`;
    productIds.push(Number(row.id));
    return Number(row.id);
};
const order = async (ids: number[], paid = true, status = 'DELIVERED') => {
    const [row] = await sql`INSERT INTO orders(order_number, total_amount, shipping_address, customer_name, customer_phone, status, payment_status)
        VALUES (${`ZZREC-${tag}-${orderIds.length}`}, 1000, ${toJsonbParam({ full_name: 'ZZ' })}::jsonb, 'ZZ', '254700000000', ${status}, ${paid ? 'PAID' : 'UNPAID'}) RETURNING id`;
    orderIds.push(Number(row.id));
    for (const id of ids) {
        const [v] = await sql`SELECT id, sku FROM product_variants WHERE product_id = ${id} LIMIT 1`;
        await sql`INSERT INTO order_items(order_id, product_id, variant_id, variant_sku, quantity, unit_price, subtotal) VALUES (${row.id}, ${id}, ${v.id}, ${v.sku}, 1, 1000, 1000)`;
    }
};

try {
    const [admin] = await sql`INSERT INTO users(email, full_name, password_hash, role, is_active)
        VALUES (${`zz-rec-admin-${tag}@example.invalid`}, 'ZZ Rec Admin', 'not-a-login', 'ADMIN', true) RETURNING id, email`;
    userIds.push(Number(admin.id));
    const now = Math.floor(Date.now() / 1000);
    const adminJwt = await sign({ sub: String(admin.id), email: admin.email, role: 'ADMIN', iat: now, exp: now + 600 }, env.JWT_SECRET, 'HS256');

    const BAGS = await category('Bags'), TOTES = await category('Totes', BAGS), SCARVES = await category('Scarves'), SHOES = await category('Shoes');
    const tote = await product('Tote', TOTES, 5000);
    const nearTote = await product('Near tote', TOTES, 5200);
    const farTote = await product('Far tote', TOTES, 30000);
    const bag = await product('Shoulder bag', BAGS, 4800, 5, 'Brown');
    const soldOutBag = await product('Sold out bag', TOTES, 5000, 0);
    const hiddenBag = await product('Hidden bag', TOTES, 5000, 5, 'Black', false);
    const scarf = await product('Scarf', SCARVES, 2500);
    const shoe = await product('Shoe', SHOES, 6000);

    // 1. Similar: same family, closest price first, never sold out or hidden.
    const rec = await call('GET', `/products/${tote}`);
    const similar = names(rec.data?.similar).filter((n) => n.startsWith('ZZ '));
    check('similar: same family, nearest price first; sold-out and hidden left out',
        rec.status === 200 && similar[0] === 'ZZ Near tote' && similar.includes('ZZ Shoulder bag') && similar.includes('ZZ Far tote')
        && !similar.includes('ZZ Sold out bag') && !similar.includes('ZZ Hidden bag') && !similar.includes('ZZ Tote') && !similar.includes('ZZ Scarf'),
        similar.join(', '));
    check('complete the look is empty with no picks or pairings for these categories', (rec.data?.complete_the_look ?? []).length === 0,
        names(rec.data?.complete_the_look).join(', '));

    // 2. Category pairings (admin): top-level only, then they fill "Complete the look".
    const notTop = await call('PUT', '/admin/categories/pairings', { category_id: TOTES, paired_category_ids: [SCARVES] }, adminJwt);
    check('pairings are only set on top-level categories', notTop.status === 400, `${notTop.status} ${notTop.message}`);
    const self = await call('PUT', '/admin/categories/pairings', { category_id: BAGS, paired_category_ids: [BAGS] }, adminJwt);
    check('a category can’t go with itself', self.status === 400);
    const setCats = await call('PUT', '/admin/categories/pairings', { category_id: BAGS, paired_category_ids: [SCARVES] }, adminJwt);
    check('admin sets Bags → Scarves', setCats.status === 200
        && setCats.data.pairings.some((p: any) => Number(p.category_id) === BAGS && p.paired_category_ids.map(Number).join() === String(SCARVES)));
    const withPairing = await call('GET', `/products/${tote}`);
    check('a subcategory product uses its top-level pairing: the scarf completes the look',
        names(withPairing.data?.complete_the_look).join() === 'ZZ Scarf', names(withPairing.data?.complete_the_look).join(', '));

    // 3. Staff picks come first and are never repeated in "You may also like".
    const tooMany = await call('PUT', `/admin/products/${tote}/pairings`, { product_ids: [scarf, shoe, bag, nearTote, farTote].map(String) }, adminJwt);
    check('at most 4 staff picks', tooMany.status === 400, `${tooMany.status} ${tooMany.message}`);
    const itself = await call('PUT', `/admin/products/${tote}/pairings`, { product_ids: [String(tote)] }, adminJwt);
    check('a product can’t go with itself', itself.status === 400);
    const notAdmin = await call('PUT', `/admin/products/${tote}/pairings`, { product_ids: [String(shoe)] });
    check('only admins set picks', notAdmin.status === 401);
    const picks = await call('PUT', `/admin/products/${tote}/pairings`, { product_ids: [String(shoe), String(nearTote)] }, adminJwt);
    check('staff picks saved in order', picks.status === 200 && names(picks.data.pairings).join() === 'ZZ Shoe,ZZ Near tote');
    const picked = await call('GET', `/products/${tote}`);
    check('picks first, then the paired category; a picked piece leaves "You may also like"',
        names(picked.data?.complete_the_look).join() === 'ZZ Shoe,ZZ Near tote,ZZ Scarf' && !names(picked.data?.similar).includes('ZZ Near tote'),
        `${names(picked.data?.complete_the_look).join(', ')} | ${names(picked.data?.similar).join(', ')}`);
    await sql`UPDATE product_variants SET stock = 0 WHERE product_id = ${shoe}`;
    const shoeOut = await call('GET', `/products/${tote}`);
    const listed = await call('GET', `/admin/products/${tote}/pairings`, undefined, adminJwt);
    check('a sold-out pick is skipped on the shop and flagged in admin',
        !names(shoeOut.data?.complete_the_look).includes('ZZ Shoe') && listed.data.pairings[0].in_stock === false);
    await sql`UPDATE product_variants SET stock = 5 WHERE product_id = ${shoe}`;

    // 4. Bought together counts from paid orders only, from the minimum number of orders.
    // Near tote and Tote are equally far in price from Far tote; only buying together separates them.
    for (let i = 0; i < MIN_BOUGHT_TOGETHER - 1; i++) await order([farTote, tote]);
    await order([farTote, tote], false);
    await order([farTote, tote], true, 'CANCELLED');
    const below = (await recommendationsQueries.boughtTogether([farTote])).get(farTote)?.get(tote) ?? 0;
    check('unpaid and cancelled orders don’t count', below === MIN_BOUGHT_TOGETHER - 1, String(below));
    const before = names((await call('GET', `/products/${farTote}`)).data?.similar).filter((n) => n.startsWith('ZZ '));
    await order([farTote, tote]);
    const after = names((await call('GET', `/products/${farTote}`)).data?.similar).filter((n) => n.startsWith('ZZ '));
    check('below the minimum nothing changes; from it, the piece bought together moves up',
        before.indexOf('ZZ Near tote') < before.indexOf('ZZ Tote') && after.indexOf('ZZ Tote') < after.indexOf('ZZ Near tote'),
        `${before.join(', ')} → ${after.join(', ')}`);

    // 5. The bag: what goes with it, never what's in it.
    const bagRec = await call('GET', `/bag?product_ids=${tote},${scarf}`);
    const bagNames = names(bagRec.data?.products);
    check('bag suggestions start with the tote’s picks and leave out bag items',
        bagRec.status === 200 && bagNames[0] === 'ZZ Shoe' && !bagNames.includes('ZZ Tote') && !bagNames.includes('ZZ Scarf'), bagNames.join(', '));
    const badIds = await call('GET', '/bag?product_ids=1,abc');
    check('bad product ids are refused', badIds.status === 400);
    const emptyBag = await call('GET', '/bag');
    check('an empty bag still gets suggestions', emptyBag.status === 200 && (emptyBag.data?.products ?? []).length > 0);

    // 6. Recently viewed: in the given order, hidden products dropped.
    const viewed = await call('GET', `/viewed?product_ids=${scarf},${hiddenBag},${tote}`);
    check('recently viewed keeps the order and drops hidden products', names(viewed.data?.products).join() === 'ZZ Scarf,ZZ Tote');

    // 7. Counts per day and rail.
    statsBefore = new Map((await sql`SELECT rail, impressions, clicks FROM recommendation_stats WHERE day = (now() AT TIME ZONE 'Africa/Nairobi')::date`)
        .map((r: any) => [r.rail, { impressions: Number(r.impressions), clicks: Number(r.clicks) }]));
    const seen = await call('POST', '/events', { rail: 'complete_the_look', event: 'impression' });
    await call('POST', '/events', { rail: 'complete_the_look', event: 'impression' });
    await call('POST', '/events', { rail: 'complete_the_look', event: 'click' });
    const bad = await call('POST', '/events', { rail: 'homepage', event: 'click' });
    const stats = await call('GET', '/admin/stats?days=1', undefined, adminJwt);
    const look = stats.data?.rails?.find((r: any) => r.rail === 'complete_the_look');
    const base = statsBefore.get('complete_the_look') ?? { impressions: 0, clicks: 0 };
    check('events are counted per rail; unknown rails refused',
        seen.status === 204 && bad.status === 400 && look?.impressions === base.impressions + 2 && look?.clicks === base.clicks + 1, JSON.stringify(look));
    check('stats list every rail', stats.data?.rails?.length === 4);
} catch (error) {
    console.error(error);
    check('recommendation suite completed without unexpected errors', false);
} finally {
    if (statsBefore) {
        // Take this run's events back out of today's counts.
        await sql`UPDATE recommendation_stats SET impressions = impressions - 2, clicks = clicks - 1
                  WHERE day = (now() AT TIME ZONE 'Africa/Nairobi')::date AND rail = 'complete_the_look'`;
        await sql`DELETE FROM recommendation_stats WHERE impressions = 0 AND clicks = 0`;
    }
    if (orderIds.length) await sql`DELETE FROM orders WHERE id IN ${sql(orderIds)}`;
    if (productIds.length) await sql`DELETE FROM products WHERE id IN ${sql(productIds)}`;
    if (categoryIds.length) await sql`DELETE FROM categories WHERE id IN ${sql([...categoryIds].reverse())}`;
    if (userIds.length) {
        await sql`DELETE FROM audit_logs WHERE actor_user_id IN ${sql(userIds)}`;
        await sql`DELETE FROM users WHERE id IN ${sql(userIds)}`;
    }
    await closeDatabase();
}

for (const [name, ok, detail] of results) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !detail ? '' : `\n     ${detail}`}`);
console.log(`${results.filter(([, ok]) => ok).length}/${results.length} recommendation checks passed. Test data removed. No emails sent.`);
if (results.some(([, ok]) => !ok)) process.exitCode = 1;
