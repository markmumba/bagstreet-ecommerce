/**
 * Gift vouchers bought online (CONTEXT.md › Gift vouchers): the voucher side of the Order lifecycle's
 * issue_gift_voucher / cancel_gift_voucher effects. The purchase is an Order with source GIFT_VOUCHER;
 * what was bought is in gift_voucher_orders. Runs inside the order's transaction.
 */
import type { sql } from '../../lib/db';
import type { AfterCommit } from '../../lib/after-commit';
import { roundMoney } from '../../lib/pricing';
import { enqueueEmail } from '../../services/email-outbox';
import type { EmailJob } from '../../services/email-jobs';
import { insertVoucher, voidVoucher } from './gift-vouchers.queries';

type Executor = typeof sql;

export interface GiftVoucherOrderRow {
    order_id: number;
    amount: string;
    deliver_to: 'RECIPIENT' | 'BUYER';
    recipient_name: string | null;
    recipient_email: string | null;
    message: string | null;
    voucher_id: number | null;
}

/** The order fields issuing needs. */
export interface VoucherSaleOrder {
    id: number;
    order_number: string;
    customer_name: string | null;
    customer_email: string | null;
}

export async function giftVoucherOrderOf(tx: Executor, orderId: number): Promise<GiftVoucherOrderRow | undefined> {
    const [row] = await tx<GiftVoucherOrderRow[]>`SELECT * FROM gift_voucher_orders WHERE order_id = ${orderId}`;
    return row;
}

/**
 * For the transition table: undefined for ordinary orders. `untouched` means nothing has happened
 * to the voucher since it was issued (no spend, hold, adjustment or cancellation).
 */
export async function giftVoucherSaleFacts(tx: Executor, orderId: number): Promise<{ issued: boolean; untouched: boolean } | undefined> {
    const row = await giftVoucherOrderOf(tx, orderId);
    if (!row) return undefined;
    if (!row.voucher_id) return { issued: false, untouched: true };
    const [used] = await tx`
        SELECT 1 FROM gift_voucher_movements WHERE voucher_id = ${row.voucher_id} AND kind NOT IN ('ISSUED', 'CODE_REPLACED') LIMIT 1
    `;
    return { issued: true, untouched: !used };
}

/** The purchase is paid: create the voucher and email its code. Safe to repeat (issues once). */
export async function issueGiftVoucherForOrder(tx: Executor, order: VoucherSaleOrder, after: AfterCommit): Promise<void> {
    const [row] = await tx<GiftVoucherOrderRow[]>`SELECT * FROM gift_voucher_orders WHERE order_id = ${order.id} FOR UPDATE`;
    if (!row || row.voucher_id) return;

    const amount = roundMoney(Number(row.amount));
    const buyerName = order.customer_name?.trim() || 'Customer';
    const voucher = await insertVoucher(tx, {
        amount,
        salePaymentMethod: 'PESAPAL',
        saleReference: order.order_number,
        purchaserName: buyerName,
        recipientName: row.recipient_name,
        recipientPhone: null,
        recipientEmail: row.deliver_to === 'RECIPIENT' ? row.recipient_email : order.customer_email,
        message: row.message,
        issuedBy: null,
        soldVia: 'ONLINE',
        purchaseOrderId: order.id,
        note: `Bought online, order ${order.order_number}`,
    });
    await tx`UPDATE gift_voucher_orders SET voucher_id = ${voucher.id} WHERE order_id = ${order.id}`;

    let queued = false;
    for (const { job, dedupeKey } of voucherSaleEmails(row, order, { code: voucher.code, amount, expiresAt: voucher.expiresAt })) {
        queued = (await enqueueEmail(job, { tx, dedupeKey })) || queued;
    }
    if (queued) after.wakeOutbox();
}

/**
 * The emails for a paid voucher purchase. The code goes to exactly one address: the recipient, or
 * the buyer when they chose to hand it over themselves. A buyer sending it to someone else gets a
 * receipt without the code.
 */
export function voucherSaleEmails(
    row: Pick<GiftVoucherOrderRow, 'deliver_to' | 'recipient_name' | 'recipient_email' | 'message'>,
    order: VoucherSaleOrder,
    voucher: { code: string; amount: number; expiresAt: Date },
): { job: EmailJob; dedupeKey: string }[] {
    const buyerName = order.customer_name?.trim() || 'Customer';
    const toRecipient = row.deliver_to === 'RECIPIENT' && Boolean(row.recipient_email);
    const to = toRecipient ? row.recipient_email! : order.customer_email;
    if (!to) return [];
    const emails: { job: EmailJob; dedupeKey: string }[] = [{
        dedupeKey: `gift-voucher:${order.id}`,
        job: {
            type: 'GIFT_VOUCHER',
            to,
            name: toRecipient ? row.recipient_name?.trim() || 'there' : buyerName,
            code: voucher.code,
            amount: voucher.amount,
            expiresAt: voucher.expiresAt.toISOString(),
            fromName: toRecipient ? buyerName : null,
            message: row.message,
            forBuyer: !toRecipient,
        },
    }];
    if (toRecipient && order.customer_email) {
        emails.push({
            dedupeKey: `gift-voucher-receipt:${order.id}`,
            job: {
                type: 'GIFT_VOUCHER_RECEIPT',
                to: order.customer_email,
                name: buyerName,
                orderRef: order.order_number,
                amount: voucher.amount,
                recipient: row.recipient_name?.trim() ? `${row.recipient_name.trim()} (${row.recipient_email})` : row.recipient_email!,
            },
        });
    }
    return emails;
}

/** The purchase's money was reversed or refunded: cancel what's left on its voucher. */
export async function cancelGiftVoucherForOrder(tx: Executor, orderId: number, reason: 'payment_reversed' | 'refunded', by: number | null) {
    const row = await giftVoucherOrderOf(tx, orderId);
    if (!row?.voucher_id) return;
    await tx`SELECT id FROM gift_vouchers WHERE id = ${row.voucher_id} FOR UPDATE`;
    await voidVoucher(tx, row.voucher_id, reason === 'refunded'
        ? 'The purchase was refunded'
        : 'The payment for this voucher was reversed by the payment provider', by);
}
