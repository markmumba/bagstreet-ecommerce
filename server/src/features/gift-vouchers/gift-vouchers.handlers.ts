import { ORDER_SOURCE, type GiftVoucherBalanceResponse, type GiftVoucherDetailResponse, type GiftVoucherResponse, type IssuedGiftVoucherResponse } from 'shared/dist';
import type { AppContext } from '@server/lib/hono';
import { getOptionalUser, getRequiredUser } from '@server/lib/hono';
import { getClientIp } from '@server/lib/client-ip';
import { createOrderAccessToken, orderTokenRef } from '@server/lib/order-received-token';
import { createOrder } from '../orders/lifecycle/order-lifecycle';
import { startOnlinePayment } from '../payments/start-payment';
import { auditFromContext } from '@server/lib/audit';
import { NotFoundError, ValidationError } from '@server/lib/errors';
import { normalisePhone } from '@server/lib/phone';
import { roundMoney } from '@server/lib/pricing';
import { paginated, success } from '@server/lib/response';
import { giftVouchersQueries, type GiftVoucherMovementRow, type GiftVoucherRow } from './gift-vouchers.queries';
import { adjustVoucherSchema, balanceVoucherSchema, issueVoucherSchema, listVouchersSchema, lookupVoucherSchema, purchaseVoucherSchema, voidVoucherSchema } from './gift-vouchers.schema';
import { assertCanTryVoucherCode, recordVoucherCodeResult } from './voucher-guard';
import { VOUCHER_NOT_FOUND, voucherStatus } from './voucher-rules';

function toResponse(row: GiftVoucherRow): GiftVoucherResponse {
    return {
        id: String(row.id),
        code_last4: row.code_last4,
        initial_amount: roundMoney(Number(row.initial_amount)),
        balance: roundMoney(Number(row.balance)),
        held: roundMoney(Number(row.held ?? 0)),
        currency: row.currency,
        status: voucherStatus(row),
        expires_at: new Date(row.expires_at).toISOString(),
        recipient_name: row.recipient_name,
        recipient_phone: row.recipient_phone,
        recipient_email: row.recipient_email,
        message: row.message,
        purchaser_name: row.purchaser_name,
        sale_payment_method: row.sale_payment_method,
        sale_reference: row.sale_reference,
        sold_via: row.sold_via,
        purchase_order_number: row.purchase_order_number,
        issued_by_email: row.issued_by_email,
        voided_at: row.voided_at ? new Date(row.voided_at).toISOString() : null,
        void_reason: row.void_reason,
        created_at: new Date(row.created_at).toISOString(),
    };
}

function toMovement(row: GiftVoucherMovementRow) {
    return {
        id: String(row.id),
        kind: row.kind,
        delta: roundMoney(Number(row.delta)),
        amount: roundMoney(Number(row.amount)),
        balance_after: roundMoney(Number(row.balance_after)),
        order_id: row.order_id != null ? String(row.order_id) : null,
        order_number: row.order_number,
        note: row.note,
        created_by_email: row.created_by_email,
        created_at: new Date(row.created_at).toISOString(),
    };
}

/** What the audit log keeps about a voucher: never the code. */
const auditView = (row: GiftVoucherRow) => ({
    code_last4: row.code_last4, balance: Number(row.balance), initial_amount: Number(row.initial_amount),
    expires_at: row.expires_at, voided_at: row.voided_at,
});

async function parse<T>(c: AppContext, schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { errors: any } } }) {
    const result = schema.safeParse(await c.req.json().catch(() => null));
    if (!result.success) throw new ValidationError('Invalid gift voucher data', result.error.errors);
    return result.data;
}

const voucherId = (c: AppContext) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) throw new NotFoundError('Gift voucher', c.req.param('id') ?? '');
    return id;
};

export const giftVouchersHandlers = {
    /** A voucher sold at the till, after the customer has paid for it. The full code is returned once. */
    issue: async (c: AppContext) => {
        const data = await parse(c, issueVoucherSchema);
        const user = getRequiredUser(c);
        const { voucher, code } = await giftVouchersQueries.issue({
            amount: data.amount,
            salePaymentMethod: data.sale_payment_method,
            saleReference: data.sale_reference,
            purchaserName: data.purchaser_name,
            recipientName: data.recipient_name,
            recipientPhone: data.recipient_phone ? normalisePhone(data.recipient_phone) : null,
            recipientEmail: data.recipient_email?.toLowerCase() ?? null,
            message: data.message,
            issuedBy: Number(user.sub),
        });
        await auditFromContext(c, {
            action: 'GIFT_VOUCHER_ISSUED', entityType: 'gift_voucher', entityId: voucher.id,
            after: auditView(voucher), metadata: { sale_payment_method: data.sale_payment_method, sale_reference: data.sale_reference },
        });
        const response: IssuedGiftVoucherResponse = { ...toResponse(voucher), code };
        return success(c, response, 'Gift voucher issued', 201);
    },

    list: async (c: AppContext) => {
        const query = listVouchersSchema.safeParse(c.req.query());
        if (!query.success) throw new ValidationError('Invalid filters', query.error.errors);
        const { rows, total } = await giftVouchersQueries.list(query.data);
        return paginated(c, rows.map(toResponse), query.data.page, query.data.limit, total);
    },

    detail: async (c: AppContext) => {
        const id = voucherId(c);
        const voucher = await giftVouchersQueries.findById(id);
        if (!voucher) throw new NotFoundError('Gift voucher', id);
        const response: GiftVoucherDetailResponse = { ...toResponse(voucher), movements: (await giftVouchersQueries.movements(id)).map(toMovement) };
        return success(c, response);
    },

    /** Staff checking a customer's voucher at the till. Wrong codes count towards the guessing limit. */
    lookup: async (c: AppContext) => {
        const { code } = await parse(c, lookupVoucherSchema);
        await assertCanTryVoucherCode(c, code);
        const voucher = await giftVouchersQueries.findByCode(code);
        if (!voucher) {
            await recordVoucherCodeResult(c, VOUCHER_NOT_FOUND);
            throw new NotFoundError('Gift voucher', 'code');
        }
        return success(c, toResponse(voucher));
    },

    void: async (c: AppContext) => {
        const id = voucherId(c);
        const { reason } = await parse(c, voidVoucherSchema);
        const { before, after } = await giftVouchersQueries.void(id, reason, Number(getRequiredUser(c).sub));
        await auditFromContext(c, {
            action: 'GIFT_VOUCHER_VOIDED', entityType: 'gift_voucher', entityId: id,
            before: auditView(before), after: auditView(after), metadata: { reason },
        });
        return success(c, toResponse(after), 'Gift voucher cancelled');
    },

    adjust: async (c: AppContext) => {
        const id = voucherId(c);
        const { delta, reason } = await parse(c, adjustVoucherSchema);
        const { before, after } = await giftVouchersQueries.adjust(id, delta, reason, Number(getRequiredUser(c).sub));
        await auditFromContext(c, {
            action: 'GIFT_VOUCHER_ADJUSTED', entityType: 'gift_voucher', entityId: id,
            before: auditView(before), after: auditView(after), metadata: { delta, reason },
        });
        return success(c, toResponse(after), 'Balance updated');
    },

    summary: async (c: AppContext) => success(c, await giftVouchersQueries.summary()),

    /** Staff replacing a lost or exposed code: same voucher and balance, new code shown once. */
    replaceCode: async (c: AppContext) => {
        const id = voucherId(c);
        const { voucher, code, oldLast4 } = await giftVouchersQueries.replaceCode(id, Number(getRequiredUser(c).sub));
        await auditFromContext(c, {
            action: 'GIFT_VOUCHER_CODE_REPLACED', entityType: 'gift_voucher', entityId: id,
            after: auditView(voucher), metadata: { old_code_last4: oldLast4 },
        });
        const response: IssuedGiftVoucherResponse = { ...toResponse(voucher), code };
        return success(c, response, 'New code issued');
    },

    /**
     * A customer buying a voucher on the storefront. The purchase is an Order (source GIFT_VOUCHER)
     * so payment, expiry and late payments work as for any order; the voucher is issued once paid.
     */
    purchase: async (c: AppContext) => {
        const data = await parse(c, purchaseVoucherSchema);
        const user = getOptionalUser(c);
        const phone = normalisePhone(data.buyer_phone);
        const email = (user?.email ?? data.buyer_email).toLowerCase();
        const order = await createOrder({
            userId: user ? Number(user.sub) : null,
            items: [],
            totalAmount: data.amount,
            shippingAddress: {
                full_name: data.buyer_name, email, phone,
                address_line1: 'Gift voucher (sent by email)', address_line2: '', city: '', state: '', postal_code: '', country: 'Kenya',
            },
            shippingLocationId: null,
            shippingCost: 0,
            discountCode: null,
            discountAmount: 0,
            customerName: data.buyer_name,
            customerPhone: phone,
            customerEmail: email,
            orderSource: ORDER_SOURCE.GIFT_VOUCHER,
            customerLimits: { phone, email },
            policyAcceptance: data.policy_acceptance,
            giftVoucherPurchase: {
                amount: data.amount,
                deliverTo: data.deliver_to,
                recipientName: data.recipient_name,
                recipientEmail: data.recipient_email?.toLowerCase() ?? null,
                message: data.message,
            },
        }, { type: 'placed_online' }, { kind: 'customer', isOwner: true, via: 'checkout' },
        { request: { ip: getClientIp(c), userAgent: c.req.header('user-agent') ?? null } });

        const payment = await startOnlinePayment(order, data.amount, phone);
        return success(c, {
            order_id: String(order.id),
            public_id: String(order.public_id),
            order_number: order.order_number,
            total_amount: data.amount,
            amount_due: data.amount,
            payment_provider: payment.provider,
            payment_reference: payment.reference,
            // Lets a guest check or retry payment without an account, as for any order.
            access_token: createOrderAccessToken(orderTokenRef(order as any)),
        }, payment.reference ? 'Check your phone to pay with M-Pesa' : 'Payment is pending', 201);
    },

    /** A customer checking what's left on a voucher. Wrong codes count towards the guessing limit. */
    balance: async (c: AppContext) => {
        const { code } = await parse(c, balanceVoucherSchema);
        await assertCanTryVoucherCode(c, code);
        const voucher = await giftVouchersQueries.findByCode(code);
        if (!voucher) {
            await recordVoucherCodeResult(c, VOUCHER_NOT_FOUND);
            throw new NotFoundError('Gift voucher', 'code');
        }
        const response: GiftVoucherBalanceResponse = {
            balance: roundMoney(Number(voucher.balance)),
            initial_amount: roundMoney(Number(voucher.initial_amount)),
            status: voucherStatus(voucher),
            expires_at: new Date(voucher.expires_at).toISOString(),
        };
        return success(c, response);
    },
};
