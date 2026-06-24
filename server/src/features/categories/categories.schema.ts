
import {z} from 'zod';


export const createCategorySchema = z.object({
    name: z.string().min(1,"Name is required").max(100,'Name to long'),
    description:z.string().max(500,'Description to long').optional().nullable(),
    parent_id: z.number().int().positive().nullable().optional(),
});

export const updateCategorySchema = createCategorySchema.partial();
