import { z } from 'zod';
import { RECOMMENDATION_RAIL } from 'shared/dist';
import { MAX_STAFF_PICKS } from './recommend';

const id = z.coerce.number().int().positive();
/** "1,2,3" → [1, 2, 3], de-duplicated, order kept. */
const idList = (max: number) => z.string().trim().max(400).optional().transform((value, ctx) => {
    const parts = (value ?? '').split(',').map((p) => p.trim()).filter(Boolean);
    const ids = [...new Set(parts.map(Number))];
    if (ids.some((n) => !Number.isInteger(n) || n <= 0)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'product_ids must be product ids separated by commas' });
        return z.NEVER;
    }
    return ids.slice(0, max);
});

export const bagQuerySchema = z.object({ product_ids: idList(20) });
export const viewedQuerySchema = z.object({ product_ids: idList(12) });

export const eventSchema = z.object({
    rail: z.enum(Object.values(RECOMMENDATION_RAIL) as [string, ...string[]]),
    event: z.enum(['impression', 'click']),
});

export const statsQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

export const productPairingsSchema = z.object({
    product_ids: z.array(id).max(MAX_STAFF_PICKS, `Choose up to ${MAX_STAFF_PICKS} products`),
});

export const categoryPairingsSchema = z.object({
    category_id: id,
    paired_category_ids: z.array(id).max(6, 'Choose up to 6 categories'),
});
