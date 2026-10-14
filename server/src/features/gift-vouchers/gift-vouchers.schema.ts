import { z } from 'zod';
import { GIFT_VOUCHER_STATUS, VOUCHER_SALE_PAYMENT_METHOD } from 'shared/dist';

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
