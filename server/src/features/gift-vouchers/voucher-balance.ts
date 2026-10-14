/**
 * Gift voucher money for orders (CONTEXT.md › Gift vouchers): the voucher side of the Order
 * lifecycle's hold_voucher / redeem_voucher / release_voucher / return_to_voucher effects.
 *
 * Every function runs inside the order's transaction and locks the voucher row before touching
 * its balance, so two checkouts can't spend the same money. Each change is a logged movement.
 */
import type { sql } from '../../lib/db';
import { BadRequestError } from '../../lib/errors';
import { roundMoney } from '../../lib/pricing';
import { LEDGER_ENTRY } from '../payments/order-balance';
import { paymentsQueries } from '../payments/payments.queries';
import { GIFT_VOUCHER_REFUND } from '../orders/lifecycle/transitions';
import { evaluateVoucher, expiryAfterGiveBack, type VoucherRuleRow } from './voucher-rules';

type Executor = typeof sql;

export type VoucherMovementKind = 'ISSUED' | 'HELD' | 'REDEEMED' | 'RELEASED' | 'RETURNED' | 'VOIDED' | 'ADJUSTED';

/** The order fields voucher money needs. */
export interface VoucherOrder {
    id: number;
    voucher_id: number | null;
    voucher_amount: string | number;
    currency?: string;
}

export interface VoucherRow extends VoucherRuleRow {
    id: number;
    code_last4: string;
    initial_amount: string;
    balance: string;
    currency: string;
    expires_at: string | Date;
    voided_at: string | Date | null;
}

/** What an order has from its voucher, from the movements. */
export interface OrderVoucherMoney {
    /** Set aside, not yet spent. */
    held: number;
    /** Spent on the order. */
    redeemed: number;
    /** Spent, then given back onto the voucher (refunds, cancellations). */
    returned: number;
}

const voucherAmountOf = (order: VoucherOrder) => roundMoney(Number(order.voucher_amount ?? 0));

export async function orderVoucherMoney(tx: Executor, orderId: number): Promise<OrderVoucherMoney> {
    const rows = await tx<{ kind: VoucherMovementKind; total: string }[]>`
        SELECT kind, SUM(amount) AS total FROM gift_voucher_movements WHERE order_id = ${orderId} GROUP BY kind
    `;
    const total = (kind: VoucherMovementKind) => roundMoney(Number(rows.find((r) => r.kind === kind)?.total ?? 0));
    return {
        held: roundMoney(Math.max(0, total('HELD') - total('REDEEMED') - total('RELEASED'))),
        redeemed: total('REDEEMED'),
        returned: total('RETURNED'),
    };
}

async function lockVoucher(tx: Executor, voucherId: number): Promise<VoucherRow> {
    const [voucher] = await tx<VoucherRow[]>`SELECT * FROM gift_vouchers WHERE id = ${voucherId} FOR UPDATE`;
    if (!voucher) throw new BadRequestError('Gift voucher not found');
    return voucher;
}

async function move(tx: Executor, voucher: VoucherRow, change: {
    kind: VoucherMovementKind; delta: number; amount: number; orderId?: number | null; note?: string | null; by?: number | null; expiresAt?: Date;
}): Promise<number> {
    const balanceAfter = roundMoney(Number(voucher.balance) + change.delta);
    if (balanceAfter < 0) throw new BadRequestError('This gift voucher no longer has enough balance. Please review your order.');
    if (change.delta !== 0 || change.expiresAt) {
        await tx`
            UPDATE gift_vouchers
            SET balance = ${balanceAfter}, expires_at = ${change.expiresAt ?? voucher.expires_at}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${voucher.id}
        `;
    }
    const [movement] = await tx<{ id: number }[]>`
        INSERT INTO gift_voucher_movements (voucher_id, kind, delta, amount, balance_after, order_id, note, created_by)
        VALUES (${voucher.id}, ${change.kind}, ${roundMoney(change.delta)}, ${roundMoney(change.amount)}, ${balanceAfter},
                ${change.orderId ?? null}, ${change.note ?? null}, ${change.by ?? null})
        RETURNING id
    `;
    voucher.balance = String(balanceAfter);
    return Number(movement!.id);
}

/**
 * What the order's voucher could pay again for a Late payment on a cancelled order: its full part
 * if the voucher can still cover it, else 0. Locks the voucher row so the answer holds until commit.
 */
export async function voucherReclaimable(tx: Executor, order: VoucherOrder, now = Date.now()): Promise<number> {
    const amount = voucherAmountOf(order);
    if (!order.voucher_id || amount <= 0) return 0;
    if ((await orderVoucherMoney(tx, order.id)).held > 0) return 0;
    const verdict = evaluateVoucher(await lockVoucher(tx, order.voucher_id), now);
    return verdict.ok && verdict.available + 0.005 >= amount ? amount : 0;
}

export const voucherBalance = {
    /** Sets the order's voucher amount aside. Returns the amount held (0 when nothing to do). */
    async hold(tx: Executor, order: VoucherOrder, by: number | null): Promise<number> {
        const amount = voucherAmountOf(order);
        if (!order.voucher_id || amount <= 0) return 0;
        if ((await orderVoucherMoney(tx, order.id)).held > 0) return 0;
        const voucher = await lockVoucher(tx, order.voucher_id);
        const verdict = evaluateVoucher(voucher);
        if (!verdict.ok) throw new BadRequestError(verdict.reason);
        if (verdict.available + 0.005 < amount) {
            throw new BadRequestError('This gift voucher no longer has enough balance. Please review your order.');
        }
        await move(tx, voucher, { kind: 'HELD', delta: -amount, amount, orderId: order.id, by });
        return amount;
    },

    /** The order is paid: its hold becomes a spend, recorded in the payment ledger. */
    async redeem(tx: Executor, order: VoucherOrder, currency: string, by: number | null): Promise<void> {
        if (!order.voucher_id) return;
        const { held } = await orderVoucherMoney(tx, order.id);
        if (held <= 0) return;
        const voucher = await lockVoucher(tx, order.voucher_id);
        const movementId = await move(tx, voucher, { kind: 'REDEEMED', delta: 0, amount: held, orderId: order.id, by });
        await paymentsQueries.createLedgerEntry({
            order_id: order.id,
            entry_type: LEDGER_ENTRY.VOUCHER_REDEEMED,
            direction: 'CREDIT',
            amount: held,
            currency,
            reference: `voucher-redeemed:${movementId}`,
            metadata: { voucher_id: voucher.id, voucher_last4: voucher.code_last4 },
        }, tx);
    },

    /**
     * Gives back everything the order still has from its voucher: a hold is released as it was;
     * money already spent is returned (a refund back onto the voucher, in the ledger too).
     */
    async release(tx: Executor, order: VoucherOrder, currency: string, by: number | null, note: string): Promise<void> {
        if (!order.voucher_id) return;
        const money = await orderVoucherMoney(tx, order.id);
        const spent = roundMoney(money.redeemed - money.returned);
        if (money.held <= 0 && spent <= 0) return;
        const voucher = await lockVoucher(tx, order.voucher_id);
        if (money.held > 0) {
            // Released holds keep the voucher's expiry: abandoning a checkout must not extend it.
            await move(tx, voucher, { kind: 'RELEASED', delta: money.held, amount: money.held, orderId: order.id, by, note });
        }
        if (spent > 0) {
            const movementId = await move(tx, voucher, {
                kind: 'RETURNED', delta: spent, amount: spent, orderId: order.id, by, note, expiresAt: expiryAfterGiveBack(voucher.expires_at),
            });
            await paymentsQueries.createLedgerEntry({
                order_id: order.id,
                entry_type: LEDGER_ENTRY.REFUND_ISSUED,
                direction: 'DEBIT',
                amount: spent,
                currency,
                reference: `voucher-returned:${movementId}`,
                metadata: { method: GIFT_VOUCHER_REFUND, reason: note, voucher_id: voucher.id, voucher_last4: voucher.code_last4, recorded_by: by },
            }, tx);
        }
    },

    /** A refund back onto the voucher (the ledger refund is recorded by the lifecycle). */
    async returnTo(tx: Executor, order: VoucherOrder, amount: number, by: number | null, note: string): Promise<void> {
        if (!order.voucher_id) throw new BadRequestError('This order was not paid by gift voucher');
        const voucher = await lockVoucher(tx, order.voucher_id);
        if (voucher.voided_at) throw new BadRequestError('This gift voucher has been cancelled. Issue a new voucher for the amount instead.');
        await move(tx, voucher, {
            kind: 'RETURNED', delta: amount, amount, orderId: order.id, by, note, expiresAt: expiryAfterGiveBack(voucher.expires_at),
        });
    },
};
