import type { AppContext } from '@server/lib/hono';
import { settingsQueries } from './settings.queries';
import { success } from '@server/lib/response';
import { BadRequestError } from '@server/lib/errors';
import { UsersQueries } from '../users/user.queries';
import { USER_ROLE } from 'shared/dist';
import { auditFromContext } from '@server/lib/audit';

async function getOrderHandoverResponse() {
    const handover = await settingsQueries.getOrderHandover();
    const manager = handover.managerId ? await UsersQueries.findById(handover.managerId) : null;
    const activeManager = manager?.role === USER_ROLE.MANAGER && manager.is_active ? manager : null;

    return {
        enabled: handover.enabled && Boolean(activeManager),
        manager_id: activeManager ? String(activeManager.id) : null,
        manager: activeManager
            ? {
                id: String(activeManager.id),
                email: activeManager.email,
                full_name: activeManager.full_name,
                role: activeManager.role,
            }
            : null,
    };
}

export const settingsHandlers = {
    getFreeDeliveryThreshold: async (c: AppContext) => {
        const threshold = await settingsQueries.getNumber('free_delivery_threshold');
        return success(c, { threshold });
    },

    updateFreeDeliveryThreshold: async (c: AppContext) => {
        const { threshold } = await c.req.json<{ threshold: number }>();
        const value = Number(threshold);
        if (!Number.isFinite(value) || value < 0) {
            throw new BadRequestError('threshold must be a non-negative number');
        }

        const updated = await settingsQueries.setNumber('free_delivery_threshold', value);
        return success(c, { threshold: updated }, 'Free delivery threshold updated');
    },

    getOrderHandover: async (c: AppContext) => {
        return success(c, await getOrderHandoverResponse());
    },

    updateOrderHandover: async (c: AppContext) => {
        const before = await getOrderHandoverResponse();
        const body = await c.req.json<{ enabled?: boolean; manager_id?: string | number | null }>();
        const enabled = Boolean(body.enabled);
        const managerId = body.manager_id == null || body.manager_id === ''
            ? null
            : Number(body.manager_id);

        if (enabled && (!managerId || !Number.isInteger(managerId))) {
            throw new BadRequestError('Select a manager before enabling order handover');
        }

        if (managerId) {
            const manager = await UsersQueries.findById(managerId);
            if (!manager || manager.role !== USER_ROLE.MANAGER || !manager.is_active) {
                throw new BadRequestError('Selected manager is not active');
            }
        }

        await settingsQueries.setOrderHandover({
            enabled,
            managerId: enabled ? managerId : null,
        });

        const after = await getOrderHandoverResponse();
        await auditFromContext(c, {
            action: 'ORDER_HANDOVER_UPDATED',
            entityType: 'settings',
            entityId: 'order_handover',
            before,
            after,
        });

        return success(c, after, 'Order handover settings updated');
    },
};
