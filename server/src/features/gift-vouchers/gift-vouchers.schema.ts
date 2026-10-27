import { z } from 'zod';
import { GIFT_VOUCHER_DELIVER_TO, GIFT_VOUCHER_ONLINE_AMOUNTS, GIFT_VOUCHER_STATUS, POLICY_VERSION, VOUCHER_SALE_PAYMENT_METHOD } from 'shared/dist';

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);

/** Shop vouchers can be any amount within sensible limits (online sales use fixed amounts, phase 2). */
export const issueVoucherSchema = z.object({
    amount: z.number().min(100, 'The smallest voucher is KES 100').max(200_000, 'The largest voucher is KES 200,000')
        .multipleOf(1, 'Use whole shillings'),
    sale_payment_method: z.nativeEnum(VOUCHER_SALE_PAYMENT_METHOD),
    sale_reference: optionalText(100),
    purchaser_name: optionalText(120),
    recipient_name: optionalText(120),
    recipient_phone: optionalText(30),
    recipient_email: z.string().trim().email('Enter a valid email').max(200).optional().or(z.literal('')).transform((v) => v || null),
    message: optionalText(300),
});

export const listVouchersSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.nativeEnum(GIFT_VOUCHER_STATUS).optional(),
    search: z.string().trim().max(100).optional(),
});

export const lookupVoucherSchema = z.object({ code: z.string().trim().min(1).max(40) });

export const voidVoucherSchema = z.object({ reason: z.string().trim().min(3, 'Say why it is being cancelled').max(300) });

export const adjustVoucherSchema = z.object({
    delta: z.number().refine((v) => v !== 0, 'Enter an amount to add or take off').refine((v) => Math.abs(v) <= 200_000, 'Too large'),
    reason: z.string().trim().min(3, 'Say why the balance is changing').max(300),
});

/** Buying a voucher on the storefront: fixed amounts, paid with M-Pesa. */
export const purchaseVoucherSchema = z.object({
    amount: z.number().refine((v) => (GIFT_VOUCHER_ONLINE_AMOUNTS as readonly number[]).includes(v),
        `Choose one of ${GIFT_VOUCHER_ONLINE_AMOUNTS.map((a) => `KES ${a.toLocaleString('en-KE')}`).join(', ')}`),
    deliver_to: z.nativeEnum(GIFT_VOUCHER_DELIVER_TO),
    recipient_name: optionalText(120),
    recipient_email: z.string().trim().email('Enter their email address').max(200).optional().or(z.literal('')).transform((v) => v || null),
    message: optionalText(300),
    buyer_name: z.string().trim().min(2, 'Enter your name').max(120),
    buyer_email: z.string().trim().email('Enter your email address').max(200),
    buyer_phone: z.string().trim().min(9, 'Enter your phone number').max(20),
    policy_acceptance: z.object({ accepted: z.literal(true), version: z.literal(POLICY_VERSION) }),
}).superRefine((data, ctx) => {
    if (data.deliver_to === GIFT_VOUCHER_DELIVER_TO.RECIPIENT && !data.recipient_email) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['recipient_email'], message: "Enter the email address we'll send the voucher to" });
    }
});

export const balanceVoucherSchema = z.object({ code: z.string().trim().min(1).max(40) });
