import { z } from 'zod';

export const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
    email: z.string().trim().toLowerCase().email('Invalid email address').max(200),
});

export const acceptInviteSchema = z.object({
    token: z.string().min(1, 'Token is required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const verifyInviteSchema = z.object({
    token: z.string().min(1, 'Token is required'),
});

export const updateProfileSchema = z.object({
    full_name: z.string().min(2, 'Full name must be at least 2 characters').max(200).optional(),
    current_password: z.string().min(1).optional(),
    new_password: z.string().min(8, 'New password must be at least 8 characters').optional(),
}).refine(
    (d) => !(d.new_password && !d.current_password),
    { message: 'Current password is required to set a new password', path: ['current_password'] }
).refine(
    (d) => d.full_name || d.new_password,
    { message: 'Provide at least full_name or new_password' }
);

export const forgotPasswordSchema = z.object({
    email: z.string().email('Invalid email address'),
});

export const resetPasswordSchema = z.object({
    token: z.string().min(1, 'Token is required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
});
