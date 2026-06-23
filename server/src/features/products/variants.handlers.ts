import type { Context } from 'hono';
import { variantsQueries } from './variants.queries';
import { productsQueries } from './products.queries';
import { createVariantSchema, updateVariantSchema } from './variants.schema';
import { success } from '@server/lib/response';
import { BadRequestError, ConflictError, NotFoundError, ValidationError } from '@server/lib/errors';
import { generateSku } from '@server/lib/util';
import type { ProductVariantResponse } from 'shared/dist';

function toVariantResponse(v: any): ProductVariantResponse {
    return {
        id: String(v.id),
        product_id: String(v.product_id),
        sku: v.sku,
        size: v.size ?? undefined,
        color: v.color ?? undefined,
        stock: v.stock,
        price_override: v.price_override != null ? parseFloat(v.price_override) : undefined,
        is_active: v.is_active,
        created_at: v.created_at,
        updated_at: v.updated_at,
    };
}

export const variantsHandlers = {
    list: async (c: Context) => {
        const productId = parseInt(c.req.param('id'));
        const product = await productsQueries.findById(productId);
        if (!product) throw new NotFoundError('Product', productId);

        const variants = await variantsQueries.findByProductId(productId);
        return success(c, variants.map(toVariantResponse));
    },

    create: async (c: Context) => {
        const productId = parseInt(c.req.param('id'));
        const product = await productsQueries.findById(productId);
        if (!product) throw new NotFoundError('Product', productId);

        const body = await c.req.json();
        const validated = createVariantSchema.safeParse(body);
        if (!validated.success) {
            throw new ValidationError('Invalid variant data', validated.error.errors);
        }

        const sku = generateSku();
        const variant = await variantsQueries.create(productId, validated.data, sku);
        return success(c, toVariantResponse(variant), 'Variant created', 201);
    },

    update: async (c: Context) => {
        const variantId = parseInt(c.req.param('vid'));
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

    delete: async (c: Context) => {
        const variantId = parseInt(c.req.param('vid'));
        const existing = await variantsQueries.findById(variantId);
        if (!existing) throw new NotFoundError('Variant', variantId);

        const inCart = await variantsQueries.hasCartRefs(variantId);
        if (inCart) throw new BadRequestError('Cannot delete variant that is in a customer cart');

        const inOrders = await variantsQueries.hasOrderRefs(variantId);
        if (inOrders) throw new BadRequestError('Cannot delete variant referenced by existing orders');

        await variantsQueries.delete(variantId);
        return success(c, null, 'Variant deleted');
    },
};
