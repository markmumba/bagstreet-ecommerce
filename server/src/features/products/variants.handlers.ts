import type { AppContext } from '@server/lib/hono';
import { variantsQueries } from './variants.queries';
import { productsQueries } from './products.queries';
import { createVariantSchema, updateVariantSchema, adjustStockSchema } from './variants.schema';
import { success } from '@server/lib/response';
import { BadRequestError, NotFoundError, ValidationError } from '@server/lib/errors';
import { generateSku } from '@server/lib/util';
import { inventory } from '../inventory/inventory';
import { AfterCommit } from '@server/lib/after-commit';
import { sql } from '@server/lib/db';
import type { ProductVariantResponse } from 'shared/dist';
import { getRequiredUser } from '@server/lib/hono';

function toVariantResponse(v: any): ProductVariantResponse & { low_stock_threshold?: number } {
    return {
        id: String(v.id),
        product_id: String(v.product_id),
        sku: v.sku,
        size: v.size ?? undefined,
        color: v.color ?? undefined,
        stock: v.stock,
        low_stock_threshold: v.low_stock_threshold ?? 5,
        price_override: v.price_override != null ? parseFloat(v.price_override) : undefined,
        is_active: v.is_active,
        created_at: v.created_at,
        updated_at: v.updated_at,
    };
}

export const variantsHandlers = {
    lowStock: async (c: AppContext) => {
        const variants = await variantsQueries.findLowStock();
        return success(c, variants.map((v) => ({
            ...toVariantResponse(v),
            product_name: v.product_name,
            product_id: String(v.product_id),
        })));
    },

    list: async (c: AppContext) => {
        const productId = parseInt(c.req.param('id')!);
        const product = await productsQueries.findById(productId);
        if (!product) throw new NotFoundError('Product', productId);

        const variants = await variantsQueries.findByProductId(productId);
        return success(c, variants.map(toVariantResponse));
    },

    create: async (c: AppContext) => {
        const productId = parseInt(c.req.param('id')!);
        const product = await productsQueries.findById(productId);
        if (!product) throw new NotFoundError('Product', productId);

        const body = await c.req.json();
        const validated = createVariantSchema.safeParse(body);
        if (!validated.success) {
            throw new ValidationError('Invalid variant data', validated.error.errors);
        }

        const { sub } = getRequiredUser(c);
        const { stock: openingStock, ...data } = validated.data;
        const after = new AfterCommit();
        const variant = await sql.begin(async (tx: typeof sql) => {
            const created = await variantsQueries.create(productId, data, generateSku(), tx);
            if (openingStock > 0) {
                await inventory.adjust(tx, Number(created.id), openingStock, 'RESTOCK', { note: 'Opening stock', by: Number(sub) }, after);
            }
            const [withStock] = await tx`SELECT * FROM product_variants WHERE id = ${created.id}`;
            return withStock;
        });
        after.run();
        return success(c, toVariantResponse(variant), 'Variant created', 201);
    },

    update: async (c: AppContext) => {
        const variantId = parseInt(c.req.param('vid')!);
        const existing = await variantsQueries.findById(variantId);
        if (!existing) throw new NotFoundError('Variant', variantId);

        const body = await c.req.json();
        const validated = updateVariantSchema.safeParse(body);
        if (!validated.success) {
            throw new ValidationError('Invalid variant data', validated.error.errors);
        }

        const updated = await variantsQueries.update(variantId, validated.data);
        return success(c, toVariantResponse(updated));
    },

    delete: async (c: AppContext) => {
        const variantId = parseInt(c.req.param('vid')!);
        const existing = await variantsQueries.findById(variantId);
        if (!existing) throw new NotFoundError('Variant', variantId);

        const inCart = await variantsQueries.hasCartRefs(variantId);
        if (inCart) throw new BadRequestError('Cannot delete variant that is in a customer cart');

        const inOrders = await variantsQueries.hasOrderRefs(variantId);
        if (inOrders) throw new BadRequestError('Cannot delete variant referenced by existing orders');

        await variantsQueries.delete(variantId);
        return success(c, null, 'Variant deleted');
    },

    adjustStock: async (c: AppContext) => {
        const { sub } = getRequiredUser(c);
        const variantId = parseInt(c.req.param('vid')!);
        const body = await c.req.json();
        const validated = adjustStockSchema.safeParse(body);
        if (!validated.success) throw new ValidationError('Invalid data', validated.error.errors);

        const existing = await variantsQueries.findById(variantId);
        if (!existing) throw new NotFoundError('Variant', variantId);

        // Inventory locks the row and checks the result under that lock, so two adjustments at once
        // can't both pass a stale "not below zero" check.
        const after = new AfterCommit();
        await sql.begin(async (tx: typeof sql) => {
            await inventory.adjust(tx, variantId, validated.data.delta, validated.data.reason, {
                note: validated.data.note ?? null,
                by: Number(sub),
            }, after);
        });
        after.run();

        const updated = await variantsQueries.findById(variantId);
        return success(c, toVariantResponse(updated!), 'Stock adjusted');
    },

    stockHistory: async (c: AppContext) => {
        const variantId = parseInt(c.req.param('vid')!);
        const existing = await variantsQueries.findById(variantId);
        if (!existing) throw new NotFoundError('Variant', variantId);

        const movements = await sql<{
            id: number; delta: number; reason: string;
            reference_id: number | null; note: string | null;
            created_by_name: string | null; created_at: string;
        }[]>`
            SELECT im.id, im.delta, im.reason, im.reference_id, im.note,
                   u.full_name AS created_by_name, im.created_at
            FROM inventory_movements im
            LEFT JOIN users u ON u.id = im.created_by
            WHERE im.variant_id = ${variantId}
            ORDER BY im.created_at DESC
            LIMIT 100
        `;
        return success(c, movements);
    },
};
