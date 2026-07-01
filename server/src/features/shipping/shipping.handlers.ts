import type { AppContext } from '@server/lib/hono';
import { shippingQueries } from './shipping.queries';
import { createShippingLocationSchema, updateShippingLocationSchema } from './shipping.schema';
import { success } from '@server/lib/response';
import { NotFoundError, ValidationError } from '@server/lib/errors';
import type { ShippingLocationResponse } from 'shared/dist';
import {
    csvTextFromRequest,
    parseBoolean,
    parseCsv,
    parseRequiredNumber,
    type ImportReport,
} from '@server/lib/csv-import';
import { auditFromContext } from '@server/lib/audit';

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
    listActive: async (c: AppContext) => {
        const locations = await shippingQueries.findAllActive();
        return success(c, locations.map(toResponse));
    },

    listAll: async (c: AppContext) => {
        const locations = await shippingQueries.findAll();
        return success(c, locations.map(toResponse));
    },

    create: async (c: AppContext) => {
        const body = await c.req.json();
        const validated = createShippingLocationSchema.safeParse(body);
        if (!validated.success) throw new ValidationError('Invalid data', validated.error.errors);

        const location = await shippingQueries.create(validated.data);
        await auditFromContext(c, {
            action: 'SHIPPING_LOCATION_CREATED',
            entityType: 'shipping_location',
            entityId: location.id,
            after: toResponse(location),
        });
        return success(c, toResponse(location), 'Shipping location created', 201);
    },

    importCsv: async (c: AppContext) => {
        const text = await csvTextFromRequest(c.req.raw);
        const rows = parseCsv(text, ['name', 'price']);
        const existing = await shippingQueries.findAll();
        const existingNames = new Set(existing.map((location) => location.name.trim().toLowerCase()));
        const report: ImportReport = {
            total_rows: rows.length,
            created: 0,
            skipped: 0,
            failed: 0,
            errors: [],
        };

        for (const row of rows) {
            try {
                const name = row.values.name?.trim();
                if (!name) throw new Error('name is required');
                if (existingNames.has(name.toLowerCase())) {
                    report.skipped += 1;
                    report.errors.push({ row: row.rowNumber, message: `Skipped duplicate shipping location "${name}"` });
                    continue;
                }

                const data = {
                    name,
                    price: parseRequiredNumber(row.values.price, 'price'),
                    is_active: parseBoolean(row.values.is_active, true),
                };

                const validated = createShippingLocationSchema.safeParse(data);
                if (!validated.success) throw new Error(validated.error.errors[0]?.message ?? 'Invalid shipping row');

                await shippingQueries.create(validated.data);
                existingNames.add(name.toLowerCase());
                report.created += 1;
            } catch (error) {
                report.failed += 1;
                report.errors.push({
                    row: row.rowNumber,
                    message: error instanceof Error ? error.message : 'Failed to import shipping location',
                });
            }
        }

        return success(c, report, 'Shipping locations CSV import complete', 201);
    },

    update: async (c: AppContext) => {
        const id = parseInt(c.req.param('id')!);
        const body = await c.req.json();
        const validated = updateShippingLocationSchema.safeParse(body);
        if (!validated.success) throw new ValidationError('Invalid data', validated.error.errors);

        const existing = await shippingQueries.findById(id);
        if (!existing) throw new NotFoundError('ShippingLocation', id);
        const location = await shippingQueries.update(id, validated.data);
        if (!location) throw new NotFoundError('ShippingLocation', id);
        await auditFromContext(c, {
            action: 'SHIPPING_LOCATION_UPDATED',
            entityType: 'shipping_location',
            entityId: id,
            before: toResponse(existing),
            after: toResponse(location),
            metadata: { fields: Object.keys(validated.data) },
        });
        return success(c, toResponse(location), 'Shipping location updated');
    },

    delete: async (c: AppContext) => {
        const id = parseInt(c.req.param('id')!);
        const existing = await shippingQueries.findById(id);
        if (!existing) throw new NotFoundError('ShippingLocation', id);

        await shippingQueries.delete(id);
        await auditFromContext(c, {
            action: 'SHIPPING_LOCATION_DELETED',
            entityType: 'shipping_location',
            entityId: id,
            before: toResponse(existing),
        });
        return success(c, null, 'Shipping location deleted');
    },
};
