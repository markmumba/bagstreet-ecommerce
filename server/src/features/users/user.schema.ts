import { z } from 'zod';
import { role } from 'shared/dist';

const staffRoles = [role.ADMIN, role.MANAGER] as const;

export const userCreateSchema = z.object({
    email: z.string().email('Invalid email address').max(200, 'Email too long'),
    full_name: z.string().min(2, 'Full name must be at least 2 characters').max(200, 'Full name too long'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    role: z.enum(staffRoles, { message: 'Role must be ADMIN or MANAGER' }),
});

export const userUpdateSchema = z.object({
    full_name: z.string().min(2, 'Full name must be at least 2 characters').max(200).optional(),
    role: z.enum(staffRoles).optional(),
    is_active: z.boolean().optional(),
}).refine(data => Object.keys(data).length > 0, { message: 'At least one field must be provided' });
