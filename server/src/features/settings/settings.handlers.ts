import type { AppContext } from '@server/lib/hono';
import { settingsQueries, HERO_DEFAULTS } from './settings.queries';
import { imageUploadService } from '@server/services/image-upload-service';
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

    getStorefrontHero: async (c: AppContext) => {
        return success(c, await settingsQueries.getStorefrontHero());
    },

    /**
     * Multipart form: optional `image` (new campaign photo), optional `remove_image=true`,
     * and `eyebrow` / `title` / `subtitle` text (blank resets a field to its default).
     */
    updateStorefrontHero: async (c: AppContext) => {
        const before = await settingsQueries.getStorefrontHero();
        const form = await c.req.formData();

        const text = (name: 'eyebrow' | 'title' | 'subtitle', max: number) => {
            const raw = form.get(name);
            if (raw == null) return before[name];
            const value = String(raw).replace(/\r\n/g, '\n').trim();
            if (value.length > max) throw new BadRequestError(`${name} must be ${max} characters or fewer`);
            return value || HERO_DEFAULTS[name];
        };

        const next = {
            ...before,
            eyebrow: text('eyebrow', 60),
            title: text('title', 120),
            subtitle: text('subtitle', 240),
        };

        const image = form.get('image');
        const removeImage = form.get('remove_image') === 'true';
        let uploadedFilename: string | null = null;

        if (image instanceof File && image.size > 0) {
            const uploaded = await imageUploadService.uploadBanner(image);
            uploadedFilename = uploaded.filename;
            next.image_url = uploaded.url;
            next.image_url_small = uploaded.smallUrl;
        } else if (removeImage) {
            next.image_url = null;
            next.image_url_small = null;
        }

        let after;
        try {
            after = await settingsQueries.setStorefrontHero(next);
        } catch (err) {
            if (uploadedFilename) await imageUploadService.delete(uploadedFilename);
            throw err;
        }

        // Clean up the previous campaign image once the new one is live.
        const previousFilename = before.image_url?.split('/').pop();
        if (previousFilename && before.image_url !== after.image_url) {
            await imageUploadService.delete(previousFilename);
        }

        await auditFromContext(c, {
            action: 'STOREFRONT_HERO_UPDATED',
            entityType: 'settings',
            entityId: 'storefront_hero',
            before,
            after,
        });

        return success(c, after, 'Homepage hero updated');
    },
};
