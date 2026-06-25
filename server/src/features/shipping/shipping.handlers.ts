import type { Context } from 'hono';
import { shippingQueries } from './shipping.queries';
import { createShippingLocationSchema, updateShippingLocationSchema } from './shipping.schema';
import { success } from '@server/lib/response';
import { NotFoundError, ValidationError } from '@server/lib/errors';
import type { ShippingLocationResponse } from 'shared/dist';

function toResponse(row: any): ShippingLocationResponse {
    return {
        id: String(row.id),
        name: row.name,
        price: parseFloat(row.price),
        is_active: row.is_active,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

export const shippingHandlers = {
    listActive: async (c: Context) => {
        const locations = await shippingQueries.findAllActive();
        return success(c, locations.map(toResponse));
    },

    listAll: async (c: Context) => {
        const locations = await shippingQueries.findAll();
        return success(c, locations.map(toResponse));
    },

    create: async (c: Context) => {
        const body = await c.req.json();
        const validated = createShippingLocationSchema.safeParse(body);
        if (!validated.success) throw new ValidationError('Invalid data', validated.error.errors);

        const location = await shippingQueries.create(validated.data);
        return success(c, toResponse(location), 'Shipping location created', 201);
    },

    update: async (c: Context) => {
        const id = parseInt(c.req.param('id')!);
        const body = await c.req.json();
        const validated = updateShippingLocationSchema.safeParse(body);
        if (!validated.success) throw new ValidationError('Invalid data', validated.error.errors);

        const location = await shippingQueries.update(id, validated.data);
        if (!location) throw new NotFoundError('ShippingLocation', id);
        return success(c, toResponse(location), 'Shipping location updated');
    },

    delete: async (c: Context) => {
        const id = parseInt(c.req.param('id')!);
        const existing = await shippingQueries.findById(id);
        if (!existing) throw new NotFoundError('ShippingLocation', id);

        await shippingQueries.delete(id);
        return success(c, null, 'Shipping location deleted');
    },
};
