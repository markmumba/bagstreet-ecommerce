import type { AppContext } from '@server/lib/hono';
import { z } from 'zod';
import { discountsQueries, type DiscountCodeRow } from './discounts.queries';
import { success } from '@server/lib/response';
import { ConflictError, NotFoundError, ValidationError } from '@server/lib/errors';
import type { DiscountCodeResponse } from 'shared/dist';
import { auditFromContext } from '@server/lib/audit';

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

export const discountsHandlers = {
    list: async (c: AppContext) => {
        const rows = await discountsQueries.list();
        return success(c, rows.map(toResponse));
    },

    create: async (c: AppContext) => {
        const body = await c.req.json();
        const parsed = discountSchema.safeParse(body);
        if (!parsed.success) throw new ValidationError('Invalid discount code', parsed.error.errors);

        const existing = await discountsQueries.findByCode(parsed.data.code);
        if (existing) throw new ConflictError('Discount code already exists');

        const row = await discountsQueries.create(parsed.data);
        await auditFromContext(c, {
            action: 'DISCOUNT_CREATED',
            entityType: 'discount_code',
            entityId: row.id,
            after: toResponse(row),
        });
        return success(c, toResponse(row), 'Discount code created', 201);
    },

    update: async (c: AppContext) => {
        const id = parseInt(c.req.param('id')!);
        const body = await c.req.json();
        const parsed = updateDiscountSchema.safeParse(body);
        if (!parsed.success) throw new ValidationError('Invalid discount code', parsed.error.errors);

        const existing = await discountsQueries.findById(id);
        if (!existing) throw new NotFoundError('Discount code', id);
        const row = await discountsQueries.update(id, parsed.data);
        if (!row) throw new NotFoundError('Discount code', id);
        await auditFromContext(c, {
            action: 'DISCOUNT_UPDATED',
            entityType: 'discount_code',
            entityId: id,
            before: toResponse(existing),
            after: toResponse(row),
            metadata: { fields: Object.keys(parsed.data) },
        });
        return success(c, toResponse(row), 'Discount code updated');
    },

    deactivate: async (c: AppContext) => {
        const id = parseInt(c.req.param('id')!);
        const existing = await discountsQueries.findById(id);
        if (!existing) throw new NotFoundError('Discount code', id);
        const row = await discountsQueries.deactivate(id);
        if (!row) throw new NotFoundError('Discount code', id);
        await auditFromContext(c, {
            action: 'DISCOUNT_DEACTIVATED',
            entityType: 'discount_code',
            entityId: id,
            before: toResponse(existing),
            after: toResponse(row),
        });
        return success(c, toResponse(row), 'Discount code deactivated');
    },
};
