import { z } from 'zod';
import { REVIEW_STATUS } from 'shared/dist';

export const upsertReviewSchema = z.object({
    order_ref: z.string().trim().min(1).max(64),
    token: z.string().trim().max(200).optional(),
    rating: z.number().int().min(1, 'Choose 1 to 5 stars').max(5, 'Choose 1 to 5 stars'),
    title: z.string().trim().max(100, 'Keep the title under 100 characters').optional().transform((v) => v || null),
    body: z.string().trim().min(10, 'Write at least a sentence (10 characters)').max(2000, 'Keep the review under 2,000 characters'),
});

export const orderAccessSchema = z.object({
    order_ref: z.string().trim().min(1).max(64),
    token: z.string().trim().max(200).optional(),
});

export const productReviewsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const adminListSchema = z.object({
    status: z.nativeEnum(REVIEW_STATUS).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const rejectSchema = z.object({ reason: z.string().trim().min(3, 'Say why it isn’t being published').max(300) });
export const replySchema = z.object({ body: z.string().trim().max(1000, 'Keep the reply under 1,000 characters') });
