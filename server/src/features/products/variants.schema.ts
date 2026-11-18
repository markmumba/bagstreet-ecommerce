import { z } from 'zod';
import { STOCK_MOVEMENT_REASON } from 'shared/dist';

export const createVariantSchema = z.object({
    size: z.string().max(20).optional(),
    color: z.string().max(50).optional(),
    stock: z.number().int().min(0),
    low_stock_threshold: z.number().int().min(0).default(5),
    price_override: z.number().min(0).optional(),
    is_active: z.boolean().default(true),
}).refine(d => d.size || d.color, { message: 'At least one of size or color must be provided' });

/** Stock isn't edited here: it changes only through a stock adjustment, so every unit is logged. */
export const updateVariantSchema = z.object({
    size: z.string().max(20).optional(),
    color: z.string().max(50).optional(),
    price_override: z.number().min(0).nullable().optional(),
    is_active: z.boolean().optional(),
    low_stock_threshold: z.number().int().min(0).optional(),
});

export const adjustStockSchema = z.object({
    delta: z.number().int(),
    reason: z.enum([STOCK_MOVEMENT_REASON.ADMIN_ADJUSTMENT, STOCK_MOVEMENT_REASON.RESTOCK]),
    note: z.string().max(500).optional(),
});
