import { z } from 'zod';

export const addToCartSchema = z.object({
    variant_id: z.number().int().positive(),
    quantity: z.number().int().min(1, 'Quantity must be at least 1').max(100, 'Quantity cannot exceed 100'),
});

export const updateCartItemSchema = z.object({
    quantity: z.number().int().min(1, 'Quantity must be at least 1').max(100, 'Quantity cannot exceed 100'),
});
