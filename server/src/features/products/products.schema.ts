import { z } from "zod";

export const createProductSchema = z.object({
    category_id: z.number().min(1,'Category is required'),
    name: z.string().min(1,"Name is required").max(200,'Name to long'),
    description: z.string().max(500,'Description to long').optional().nullable(),
    price: z.number().min(0,'Price must be greater than 0'),
    stock: z.number().min(0,'Stock must be greater than 0').optional().nullable(),
    image_url: z.string().url('Invalid image URL').optional().nullable(),
    is_active: z.boolean().default(true),
});

export const updateProductSchema = createProductSchema.partial();