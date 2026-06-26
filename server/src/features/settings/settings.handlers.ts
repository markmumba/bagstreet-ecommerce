import type { Context } from 'hono';
import { settingsQueries } from './settings.queries';
import { success } from '@server/lib/response';
import { BadRequestError } from '@server/lib/errors';

export const settingsHandlers = {
    getFreeDeliveryThreshold: async (c: Context) => {
        const threshold = await settingsQueries.getNumber('free_delivery_threshold');
        return success(c, { threshold });
    },

    updateFreeDeliveryThreshold: async (c: Context) => {
        const { threshold } = await c.req.json<{ threshold: number }>();
        const value = Number(threshold);
        if (!Number.isFinite(value) || value < 0) {
            throw new BadRequestError('threshold must be a non-negative number');
        }

        const updated = await settingsQueries.setNumber('free_delivery_threshold', value);
        return success(c, { threshold: updated }, 'Free delivery threshold updated');
    },
};
