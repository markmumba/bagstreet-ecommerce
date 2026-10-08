import { z } from 'zod';
import { STOREFRONT_SORTS } from 'shared/dist';

export const catalogQuerySchema = z.object({
    page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    limit: z.coerce.number().int().min(1).max(48).default(24),
    search: z.string().trim().max(200).default(''),
    categorySlug: z.string().min(1).max(100).optional(),
    categoryId: z.coerce.number().int().positive().optional(),
    sort: z.enum(STOREFRONT_SORTS).default('newest'),
});

export function catalogPagination(page: number, limit: number, total: number) {
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return { page: Math.min(page, totalPages), limit, total, total_pages: totalPages };
}
