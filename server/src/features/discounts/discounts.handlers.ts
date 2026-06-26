import type { Context } from 'hono';
import { z } from 'zod';
import { discountsQueries, type DiscountCodeRow } from './discounts.queries';
import { normalisePhone } from '../../services/mpesa';
import { success } from '@server/lib/response';
import { BadRequestError, ConflictError, NotFoundError, ValidationError } from '@server/lib/errors';
import type { DiscountCodeResponse, DiscountValidationResponse } from 'shared/dist';

const discountSchema = z.object({
    code: z.string().min(2).max(50).regex(/^[A-Za-z0-9_-]+$/),
    value: z.coerce.number().min(0.01).max(100),
    min_order_amount: z.coerce.number().min(0).default(0),
    usage_limit: z.coerce.number().int().positive().nullable().optional(),
    expires_at: z.string().datetime().nullable().optional(),
    is_active: z.boolean().optional(),
});

const updateDiscountSchema = discountSchema.partial();

function toResponse(row: DiscountCodeRow): DiscountCodeResponse {
    return {
        id: String(row.id),
        code: row.code,
        value: parseFloat(row.value),
        min_order_amount: parseFloat(row.min_order_amount),
        usage_limit: row.usage_limit ?? undefined,
        used_count: row.used_count,
        expires_at: row.expires_at ?? undefined,
        is_active: row.is_active,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

export async function validateDiscount(
    code: string | undefined,
    subtotal: number,
    phone: string
): Promise<{
    valid: boolean;
    discountAmount: number;
    normalizedCode?: string;
    codeId?: number;
    reason?: string;
}> {
    if (!code?.trim()) return { valid: true, discountAmount: 0 };

    const row = await discountsQueries.findByCode(code.trim());
    if (!row) return { valid: false, discountAmount: 0, reason: 'Discount code was not found' };
    if (!row.is_active) return { valid: false, discountAmount: 0, reason: 'Discount code is not active' };
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
        return { valid: false, discountAmount: 0, reason: 'Discount code has expired' };
    }
    if (row.usage_limit != null && row.used_count >= row.usage_limit) {
        return { valid: false, discountAmount: 0, reason: 'Discount code usage limit has been reached' };
    }

    const minOrderAmount = parseFloat(row.min_order_amount);
    if (subtotal < minOrderAmount) {
        return {
            valid: false,
            discountAmount: 0,
            reason: `Minimum order amount is KES ${minOrderAmount.toFixed(2)}`,
        };
    }

    const normalizedPhone = normalisePhone(phone);
    if (await discountsQueries.hasUsageForPhone(row.id, normalizedPhone)) {
        return { valid: false, discountAmount: 0, reason: 'This phone number has already used this code' };
    }

    const value = parseFloat(row.value);
    return {
        valid: true,
        discountAmount: Math.floor((subtotal * value) / 100),
        normalizedCode: row.code,
        codeId: row.id,
    };
}

export const discountsHandlers = {
    list: async (c: Context) => {
        const rows = await discountsQueries.list();
        return success(c, rows.map(toResponse));
    },

    create: async (c: Context) => {
        const body = await c.req.json();
        const parsed = discountSchema.safeParse(body);
        if (!parsed.success) throw new ValidationError('Invalid discount code', parsed.error.errors);

        const existing = await discountsQueries.findByCode(parsed.data.code);
        if (existing) throw new ConflictError('Discount code already exists');

        const row = await discountsQueries.create(parsed.data);
        return success(c, toResponse(row), 'Discount code created', 201);
    },

    update: async (c: Context) => {
        const id = parseInt(c.req.param('id')!);
        const body = await c.req.json();
        const parsed = updateDiscountSchema.safeParse(body);
        if (!parsed.success) throw new ValidationError('Invalid discount code', parsed.error.errors);

        const row = await discountsQueries.update(id, parsed.data);
        if (!row) throw new NotFoundError('Discount code', id);
        return success(c, toResponse(row), 'Discount code updated');
    },

    deactivate: async (c: Context) => {
        const id = parseInt(c.req.param('id')!);
        const row = await discountsQueries.deactivate(id);
        if (!row) throw new NotFoundError('Discount code', id);
        return success(c, toResponse(row), 'Discount code deactivated');
    },

    validate: async (c: Context) => {
        const code = c.req.query('code');
        const subtotal = Number(c.req.query('subtotal') ?? 0);
        const phone = c.req.query('phone') ?? '';

        if (!code) throw new BadRequestError('code is required');
        if (!phone) throw new BadRequestError('phone is required');
        if (!Number.isFinite(subtotal) || subtotal < 0) throw new BadRequestError('subtotal must be valid');

        const result = await validateDiscount(code, subtotal, phone);
        const data: DiscountValidationResponse = {
            valid: result.valid,
            code: result.normalizedCode ?? code.toUpperCase(),
            discount_amount: result.discountAmount,
            message: result.valid ? 'Discount applied' : result.reason ?? 'Discount code is invalid',
        };

        return success(c, data, data.message);
    },
};
