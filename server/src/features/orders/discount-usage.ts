import type { sql } from '../../lib/db';
import { BadRequestError } from '../../lib/errors';
import { normalisePhone } from '../../lib/phone';
import { evaluateDiscount, type DiscountRuleCode } from '../quote/discount-rules';

type Executor = typeof sql;

/**
 * Claims one use of a discount code for an order. Runs inside the order transaction with the code
 * row locked, and re-applies the same rules the quote used (discount-rules.ts), so concurrent
 * checkouts can't exceed `usage_limit`, reuse a code for the same phone, or use an expired one.
 */
export async function recordDiscountUsage(
    tx: Executor,
    orderId: number,
    usage: { codeId: number; phone: string; amount: number; subtotal: number; userId: number | null },
) {
    const [code] = await tx<(DiscountRuleCode & { id: number })[]>`
        SELECT * FROM discount_codes WHERE id = ${usage.codeId} FOR UPDATE
    `;
    const [alreadyUsed] = await tx`
        SELECT 1 FROM discount_code_usages WHERE code_id = ${usage.codeId} AND phone = ${usage.phone} LIMIT 1
    `;
    const [accountUsed] = usage.userId != null
        ? await tx`SELECT 1 FROM discount_code_usages WHERE code_id = ${usage.codeId} AND user_id = ${usage.userId} LIMIT 1`
        : [];
    const verdict = evaluateDiscount(code, {
        subtotal: usage.subtotal,
        phoneAlreadyUsed: Boolean(alreadyUsed),
        signedIn: usage.userId != null,
        accountAlreadyUsed: Boolean(accountUsed),
    });
    if (!verdict.ok) throw new BadRequestError(verdict.reason);
    if (verdict.amount !== usage.amount) throw new BadRequestError('This discount has changed. Please review your order.');

    await tx`
        INSERT INTO discount_code_usages (code_id, order_id, phone, discount_amount, user_id)
        VALUES (${usage.codeId}, ${orderId}, ${usage.phone}, ${usage.amount}, ${usage.userId})
    `;
    await tx`UPDATE discount_codes SET used_count = used_count + 1 WHERE id = ${usage.codeId}`;
}

/** Gives back the discount use held by a cancelled order so the customer can use the code again. */
export async function releaseDiscountUsage(tx: Executor, orderId: number) {
    const released = await tx<{ code_id: number }[]>`
        DELETE FROM discount_code_usages WHERE order_id = ${orderId} RETURNING code_id
    `;
    for (const row of released) {
        await tx`UPDATE discount_codes SET used_count = GREATEST(used_count - 1, 0) WHERE id = ${row.code_id}`;
    }
}

/**
 * Re-claims the discount an existing order was priced with (an order leaving CANCELLED).
 * The price was already agreed, so with `allowOverLimit` a code that has since hit its limit,
 * been switched off, or been used by the same phone elsewhere is still honoured — it just can't
 * be counted twice.
 */
export async function claimOrderDiscount(
    tx: Executor,
    order: { id: number; user_id?: number | null; discount_code?: string | null; discount_amount?: string | number | null; customer_phone?: string | null },
    allowOverLimit: boolean,
) {
    const amount = Number(order.discount_amount ?? 0);
    if (!order.discount_code || amount <= 0) return;

    const [held] = await tx`SELECT 1 FROM discount_code_usages WHERE order_id = ${order.id} LIMIT 1`;
    if (held) return;

    const [code] = await tx<{ id: number }[]>`
        SELECT id FROM discount_codes WHERE UPPER(code) = UPPER(${order.discount_code}) FOR UPDATE
    `;
    if (!code) return;
    const phone = normalisePhone(String(order.customer_phone ?? ''));

    if (!allowOverLimit) {
        const [items] = await tx<{ subtotal: string }[]>`SELECT COALESCE(SUM(subtotal), 0) AS subtotal FROM order_items WHERE order_id = ${order.id}`;
        await recordDiscountUsage(tx, order.id, {
            codeId: code.id, phone, amount, subtotal: Number(items?.subtotal ?? 0), userId: order.user_id != null ? Number(order.user_id) : null,
        });
        return;
    }
    const inserted = await tx`
        INSERT INTO discount_code_usages (code_id, order_id, phone, discount_amount, user_id)
        VALUES (${code.id}, ${order.id}, ${phone}, ${amount}, ${order.user_id ?? null})
        ON CONFLICT DO NOTHING
        RETURNING id
    `;
    if (inserted.length > 0) {
        await tx`UPDATE discount_codes SET used_count = used_count + 1 WHERE id = ${code.id}`;
    }
}
