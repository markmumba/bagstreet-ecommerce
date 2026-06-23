import type { Context } from 'hono';
import { UsersQueries } from './user.queries';
import { userCreateSchema, userUpdateSchema } from './user.schema';
import { success, paginated } from '@server/lib/response';
import {
    ConflictError,
    InternalServerError,
    NotFoundError,
    ValidationError,
} from '@server/lib/errors';
import type { User, UserCreateRequest, UserResponse } from 'shared/dist';

function toUserResponse(user: User): UserResponse {
    return {
        id: user.id.toString(),
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        is_active: user.is_active,
        created_at: user.created_at,
        updated_at: user.updated_at,
    };
}

export const userHandlers = {

    list: async (c: Context) => {
        const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
        const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '20', 10)));
        const search = c.req.query('search') ?? '';
        const roleParam = c.req.query('role') ?? null;
        const statusParam = c.req.query('status');
        const isActive = statusParam === 'true' ? true : statusParam === 'false' ? false : null;

        const [users, total] = await Promise.all([
            UsersQueries.findAll(page, limit, search, roleParam, isActive),
            UsersQueries.countAll(search, roleParam, isActive),
        ]);

        return paginated(c, users.map(toUserResponse), page, limit, total);
    },

    get: async (c: Context) => {
        const id = parseInt(c.req.param('id'));
        const user = await UsersQueries.findById(id);
        if (!user) throw new NotFoundError('User', id);
        return success(c, toUserResponse(user));
    },

    create: async (c: Context) => {
        const body = await c.req.json<UserCreateRequest>();
        const validated = userCreateSchema.safeParse(body);
        if (!validated.success) throw new ValidationError('Invalid user data', validated.error.errors);

        const existing = await UsersQueries.findByEmail(validated.data.email);
        if (existing) throw new ConflictError('User with this email already exists');

        const password_hash = await Bun.password.hash(validated.data.password);
        const user = await UsersQueries.create({
            email: validated.data.email,
            full_name: validated.data.full_name,
            password_hash,
            role: validated.data.role,
        });

        if (!user) throw new InternalServerError('Failed to create user');
        return success(c, toUserResponse(user), 'User created successfully', 201);
    },

    update: async (c: Context) => {
        const id = parseInt(c.req.param('id'));
        const body = await c.req.json();
        const validated = userUpdateSchema.safeParse(body);
        if (!validated.success) throw new ValidationError('Invalid user data', validated.error.errors);

        const existing = await UsersQueries.findById(id);
        if (!existing) throw new NotFoundError('User', id);

        const updated = await UsersQueries.update(id, validated.data);
        if (!updated) throw new InternalServerError('Failed to update user');

        return success(c, toUserResponse(updated), 'User updated successfully');
    },

    delete: async (c: Context) => {
        const id = parseInt(c.req.param('id'));
        const user = await UsersQueries.findById(id);
        if (!user) throw new NotFoundError('User', id);
        await UsersQueries.delete(id);
        return success(c, null, 'User deleted successfully');
    },
};
