import type { AppContext } from '@server/lib/hono';
import { paginated } from '@server/lib/response';
import { BadRequestError } from '@server/lib/errors';
import { auditQueries } from './audit.queries';

export const auditHandlers = {
    list: async (c: AppContext) => {
        const page = Math.max(1, Number(c.req.query('page') ?? 1));
        const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? 20)));
        const actorUserIdParam = c.req.query('actor_user_id');
        const actorUserId = actorUserIdParam ? Number(actorUserIdParam) : null;

        if (actorUserIdParam && (!Number.isInteger(actorUserId) || actorUserId! <= 0)) {
            throw new BadRequestError('actor_user_id must be a positive integer');
        }

        const filters = {
            action: c.req.query('action') ?? null,
            entityType: c.req.query('entity_type') ?? null,
            entityId: c.req.query('entity_id') ?? null,
            actorUserId,
        };

        const [rows, total] = await Promise.all([
            auditQueries.list({ page, limit, ...filters }),
            auditQueries.count(filters),
        ]);

        return paginated(c, rows, page, limit, total);
    },
};
