import type { AppContext } from '@server/lib/hono';
import { randomBytes, createHash } from 'crypto';
import { UsersQueries } from './user.queries';
import { userCreateSchema, userUpdateSchema } from './user.schema';
import { success, paginated } from '@server/lib/response';
import {
    ConflictError,
    InternalServerError,
    NotFoundError,
    ValidationError,
} from '@server/lib/errors';
import { publishEmail } from '@server/services/messagequeue';
import { env } from '@server/config/env';
import type { User, UserResponse } from 'shared/dist';
import { auditFromContext } from '@server/lib/audit';

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

    list: async (c: AppContext) => {
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

    get: async (c: AppContext) => {
        const id = parseInt(c.req.param('id')!);
        const user = await UsersQueries.findById(id);
        if (!user) throw new NotFoundError('User', id);
        return success(c, toUserResponse(user));
    },

    create: async (c: AppContext) => {
        const body = await c.req.json();
        const validated = userCreateSchema.safeParse(body);
        if (!validated.success) throw new ValidationError('Invalid user data', validated.error.errors);

        const existing = await UsersQueries.findByEmail(validated.data.email);
        if (existing) throw new ConflictError('User with this email already exists');

        const placeholder = await Bun.password.hash(randomBytes(32).toString('hex'));
        const user = await UsersQueries.create({
            email: validated.data.email,
            full_name: validated.data.full_name,
            password_hash: placeholder,
            role: validated.data.role,
        });

        if (!user) throw new InternalServerError('Failed to create user');

        const rawToken = randomBytes(32).toString('hex');
        const tokenHash = createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await UsersQueries.createInvitation(Number(user.id), tokenHash, expiresAt);

        const inviteUrl = `${env.CLIENT_URL}/accept-invite?token=${rawToken}`;
        await publishEmail({ type: 'INVITE', to: validated.data.email, name: validated.data.full_name, inviteUrl });
        await auditFromContext(c, {
            action: 'USER_INVITED',
            entityType: 'user',
            entityId: user.id,
            after: toUserResponse(user),
            metadata: { invited_role: user.role },
        });

        return success(c, toUserResponse(user), 'Invite sent successfully', 201);
    },

    update: async (c: AppContext) => {
        const id = parseInt(c.req.param('id')!);
        const body = await c.req.json();
        const validated = userUpdateSchema.safeParse(body);
        if (!validated.success) throw new ValidationError('Invalid user data', validated.error.errors);

        const existing = await UsersQueries.findById(id);
        if (!existing) throw new NotFoundError('User', id);

        const updated = await UsersQueries.update(id, validated.data);
        if (!updated) throw new InternalServerError('Failed to update user');
        await auditFromContext(c, {
            action: 'USER_UPDATED',
            entityType: 'user',
            entityId: id,
            before: toUserResponse(existing),
            after: toUserResponse(updated),
            metadata: { fields: Object.keys(validated.data) },
        });

        return success(c, toUserResponse(updated), 'User updated successfully');
    },

    delete: async (c: AppContext) => {
        const id = parseInt(c.req.param('id')!);
        const user = await UsersQueries.findById(id);
        if (!user) throw new NotFoundError('User', id);
        await UsersQueries.delete(id);
        await auditFromContext(c, {
            action: 'USER_DELETED',
            entityType: 'user',
            entityId: id,
            before: toUserResponse(user),
        });
        return success(c, null, 'User deleted successfully');
    },
};
