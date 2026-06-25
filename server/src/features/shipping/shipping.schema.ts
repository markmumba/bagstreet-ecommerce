import { z } from 'zod';

export const createShippingLocationSchema = z.object({
    name: z.string().min(1).max(100),
    price: z.number().min(0),
    is_active: z.boolean().optional(),
});

export const updateShippingLocationSchema = createShippingLocationSchema.partial();
