import { z } from 'zod';

const shippingAddressSchema = z.object({
    full_name: z.string().min(2).max(200),
    address_line1: z.string().min(1).max(200),
    address_line2: z.string().max(200).optional(),
    city: z.string().min(1).max(100),
    state: z.string().min(1).max(100),
    postal_code: z.string().min(1).max(20),
    country: z.string().min(2).max(100),
    phone: z.string().max(20).optional(),
});

export const createOrderSchema = z.object({
    items: z
        .array(
            z.object({
                variant_id: z.number().int().positive(),
                quantity: z.number().int().positive('Quantity must be at least 1'),
            })
        )
        .min(1, 'Order must have at least one item'),
    shipping_address: shippingAddressSchema,
    shipping_location_id: z.number().int().positive(),
    phone: z.string().min(9).max(15),
    notes: z.string().max(500).optional(),
});

export const updateOrderStatusSchema = z.object({
    status: z.enum(['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']),
});
