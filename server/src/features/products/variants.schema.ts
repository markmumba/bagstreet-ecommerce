import { z } from 'zod';

export const createVariantSchema = z.object({
    size: z.string().max(20).optional(),
    color: z.string().max(50).optional(),
    stock: z.number().int().min(0),
    price_override: z.number().min(0).optional(),
    is_active: z.boolean().default(true),
}).refine(d => d.size || d.color, { message: 'At least one of size or color must be provided' });

export const updateVariantSchema = z.object({
    size: z.string().max(20).optional(),
    color: z.string().max(50).optional(),
    stock: z.number().int().min(0).optional(),
    price_override: z.number().min(0).nullable().optional(),
    is_active: z.boolean().optional(),
});
