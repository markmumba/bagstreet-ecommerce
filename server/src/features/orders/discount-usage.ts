import type { sql } from '../../lib/db';
import { BadRequestError } from '../../lib/errors';
import { normalisePhone } from '../../lib/phone';

type Executor = typeof sql;

/**
 * Claims one use of a discount code for an order. Runs inside the order transaction and locks the
 * code row, so concurrent checkouts can't exceed `usage_limit` or reuse a code for the same phone.
 */
export async function recordDiscountUsage(
    tx: Executor,
    orderId: number,
    usage: { codeId: number; phone: string; amount: number },
) {
    const [code] = await tx<{ id: number; is_active: boolean; usage_limit: number | null; used_count: number }[]>`
        SELECT id, is_active, usage_limit, used_count FROM discount_codes WHERE id = ${usage.codeId} FOR UPDATE
    `;
    if (!code || !code.is_active) throw new BadRequestError('Discount code is not active');
    if (code.usage_limit != null && code.used_count >= code.usage_limit) {
        throw new BadRequestError('Discount code usage limit has been reached');
    }

    const [alreadyUsed] = await tx`
        SELECT 1 FROM discount_code_usages WHERE code_id = ${usage.codeId} AND phone = ${usage.phone} LIMIT 1
    `;
    if (alreadyUsed) throw new BadRequestError('This phone number has already used this code');

    await tx`
        INSERT INTO discount_code_usages (code_id, order_id, phone, discount_amount)
        VALUES (${usage.codeId}, ${orderId}, ${usage.phone}, ${usage.amount})
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
    order: { id: number; discount_code?: string | null; discount_amount?: string | number | null; customer_phone?: string | null },
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
        await recordDiscountUsage(tx, order.id, { codeId: code.id, phone, amount });
        return;
    }
    const inserted = await tx`
        INSERT INTO discount_code_usages (code_id, order_id, phone, discount_amount)
        VALUES (${code.id}, ${order.id}, ${phone}, ${amount})
        ON CONFLICT (code_id, phone) DO NOTHING
        RETURNING id
    `;
    if (inserted.length > 0) {
        await tx`UPDATE discount_codes SET used_count = used_count + 1 WHERE id = ${code.id}`;
    }
}
