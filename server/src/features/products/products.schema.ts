import { z } from "zod";

export const createProductSchema = z.object({
    category_id: z.coerce.number().int().positive('Category is required'),
    name: z.string().min(1,"Name is required").max(200,'Name to long'),
    description: z.string().max(500,'Description to long').optional().nullable(),
    price: z.coerce.number().min(0,'Price must be greater than 0'),
    stock: z.coerce.number().min(0,'Stock cannot be negative').optional().nullable(),
    image_file: z.instanceof(File).optional(),
    is_active: z.boolean().default(true),
});

export const updateProductSchema = z.object({
    name: z.string().min(1,"Name is required").max(200,'Name to long').optional(),
    description: z.string().max(500,'Description to long').optional(),
    price: z.number().min(0,'Price must be greater than 0').optional(),
    is_featured: z.boolean().optional(),
})