import type { Context } from 'hono';
import { cartQueries, type CartItemRow } from './cart.queries';
import { addToCartSchema, updateCartItemSchema } from './cart.schema';
import { sql } from '../../lib/db';
import { success } from '@server/lib/response';
import { BadRequestError, NotFoundError, ValidationError } from '@server/lib/errors';
import type { CartResponse, CartItemResponse } from 'shared/dist';

interface JWTPayload { sub: string }

function toCartResponse(items: CartItemRow[]): CartResponse {
    const mapped: CartItemResponse[] = items.map((item) => ({
        id: String(item.id),
        variant_id: String(item.variant_id),
        product_name: item.product_name,
        product_image_url: item.product_image_url,
        variant_sku: item.variant_sku,
        variant_size: item.variant_size ?? undefined,
        variant_color: item.variant_color ?? undefined,
        unit_price: parseFloat(item.unit_price),
        quantity: item.quantity,
        subtotal: parseFloat(item.subtotal),
    }));

    const total = mapped.reduce((sum, item) => sum + item.subtotal, 0);
    const item_count = mapped.reduce((sum, item) => sum + item.quantity, 0);

    return { items: mapped, total, item_count };
}

export const cartHandlers = {

    get: async (c: Context) => {
        const { sub } = c.get('user') as JWTPayload;
        const items = await cartQueries.getCart(Number(sub));
        return success(c, toCartResponse(items));
    },

    add: async (c: Context) => {
        const { sub } = c.get('user') as JWTPayload;
        const body = await c.req.json();
        const validated = addToCartSchema.safeParse(body);

        if (!validated.success) {
            throw new ValidationError('Invalid cart data', validated.error.errors);
        }

        interface VariantRow { id: number; stock: number; is_active: boolean; price_override: string | null; product_id: number }
        interface ProductRow { id: number; name: string; is_active: boolean }

        const [variant] = await sql<VariantRow[]>`
            SELECT id, stock, is_active, price_override, product_id
            FROM product_variants WHERE id = ${validated.data.variant_id}
        `;
        if (!variant) throw new NotFoundError('Variant', validated.data.variant_id);
        if (!variant.is_active) throw new BadRequestError('This variant is not available');

        const [product] = await sql<ProductRow[]>`
            SELECT id, name, is_active FROM products WHERE id = ${variant.product_id}
        `;
        if (!product) throw new NotFoundError('Product', variant.product_id);
        if (!product.is_active) throw new BadRequestError(`"${product.name}" is not available`);

        if (variant.stock < validated.data.quantity) {
            throw new BadRequestError(`Insufficient stock (available: ${variant.stock})`);
        }

        await cartQueries.upsertItem(Number(sub), validated.data.variant_id, validated.data.quantity);

        const items = await cartQueries.getCart(Number(sub));
        return success(c, toCartResponse(items), 'Item added to cart', 201);
    },

    update: async (c: Context) => {
        const { sub } = c.get('user') as JWTPayload;
        const variantId = parseInt(c.req.param('variantId')!);
        const body = await c.req.json();
        const validated = updateCartItemSchema.safeParse(body);

        if (!validated.success) {
            throw new ValidationError('Invalid quantity', validated.error.errors);
        }

        const updated = await cartQueries.updateQuantity(Number(sub), variantId, validated.data.quantity);
        if (!updated) throw new NotFoundError('Cart item', variantId);

        const items = await cartQueries.getCart(Number(sub));
        return success(c, toCartResponse(items), 'Cart updated');
    },

    remove: async (c: Context) => {
        const { sub } = c.get('user') as JWTPayload;
        const variantId = parseInt(c.req.param('variantId')!);

        const removed = await cartQueries.removeItem(Number(sub), variantId);
        if (!removed) throw new NotFoundError('Cart item', variantId);

        const items = await cartQueries.getCart(Number(sub));
        return success(c, toCartResponse(items), 'Item removed from cart');
    },

    clear: async (c: Context) => {
        const { sub } = c.get('user') as JWTPayload;
        await cartQueries.clearCart(Number(sub));
        return success(c, toCartResponse([]), 'Cart cleared');
    },
};
