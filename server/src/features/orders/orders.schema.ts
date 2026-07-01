import { z } from 'zod';
import { ORDER_STATUS, WALK_IN_PAYMENT_METHOD } from 'shared/dist';

const shippingAddressSchema = z.object({
    full_name: z.string().trim().min(2).max(200),
    email: z.string().trim().email().optional(),
    address_line1: z.string().trim().min(1).max(200),
    address_line2: z.string().max(200).optional(),
    city: z.string().trim().min(1).max(100),
    state: z.string().trim().min(1).max(100).optional(),
    county: z.string().trim().min(1).max(100).optional(),
    postal_code: z.string().trim().max(20).optional().default(''),
    country: z.string().trim().min(2).max(100).optional().default('Kenya'),
    phone: z.string().trim().max(20).optional(),
}).refine((address) => address.state || address.county, {
    message: 'County is required',
    path: ['county'],
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
    email: z.string().trim().email().optional(),
    discount_code: z.string().max(50).optional(),
    notes: z.string().max(500).optional(),
});

export const updateOrderStatusSchema = z.object({
    status: z.enum([
        ORDER_STATUS.CONFIRMED,
        ORDER_STATUS.DELIVERED,
        ORDER_STATUS.CANCELLED,
        ORDER_STATUS.REFUNDED,
    ]),
});

export const createWalkInSaleSchema = z.object({
    items: z
        .array(
            z.object({
                variant_id: z.number().int().positive(),
                quantity: z.number().int().positive('Quantity must be at least 1'),
            })
        )
        .min(1, 'Sale must have at least one item'),
    payment_method: z.enum([
        WALK_IN_PAYMENT_METHOD.CASH,
        WALK_IN_PAYMENT_METHOD.CARD,
        WALK_IN_PAYMENT_METHOD.BANK_TRANSFER,
        WALK_IN_PAYMENT_METHOD.PESAPAL,
        WALK_IN_PAYMENT_METHOD.OTHER,
    ]),
    customer_name: z.string().trim().max(100).optional(),
    customer_phone: z.string().trim().max(20).optional(),
    customer_email: z
        .union([z.string().trim().email(), z.literal('')])
        .optional()
        .transform((value) => value || undefined),
    notes: z.string().trim().max(500).optional(),
});
