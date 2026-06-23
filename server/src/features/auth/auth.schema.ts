import { z } from 'zod';

export const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
    email: z.string().email('Invalid email address').max(200),
    full_name: z.string().min(2, 'Full name must be at least 2 characters').max(200),
    password: z.string().min(8, 'Password must be at least 8 characters'),
});
