import { sql } from '../../lib/db';

export interface CartItemRow {
    id: number;
    user_id: number;
    variant_id: number;
    product_name: string;
    product_image_url: string;
    variant_sku: string;
    variant_size: string | null;
    variant_color: string | null;
    unit_price: string;
    quantity: number;
    subtotal: string;
}

export const cartQueries = {
    getCart: async (userId: number): Promise<CartItemRow[]> => {
        return await sql<CartItemRow[]>`
            SELECT
                ci.id,
                ci.user_id,
                ci.variant_id,
                p.name AS product_name,
                COALESCE(p.image_url, '') AS product_image_url,
                pv.sku AS variant_sku,
                pv.size AS variant_size,
                pv.color AS variant_color,
                COALESCE(
                    pv.price_override,
                    CASE
                        WHEN p.sale_price IS NOT NULL
                         AND (p.sale_ends_at IS NULL OR p.sale_ends_at > NOW())
                        THEN p.sale_price
                        ELSE p.price
                    END
                ) AS unit_price,
                ci.quantity,
                (
                    COALESCE(
                        pv.price_override,
                        CASE
                            WHEN p.sale_price IS NOT NULL
                             AND (p.sale_ends_at IS NULL OR p.sale_ends_at > NOW())
                            THEN p.sale_price
                            ELSE p.price
                        END
                    ) * ci.quantity
                )::DECIMAL(10,2) AS subtotal
            FROM cart_items ci
            JOIN product_variants pv ON pv.id = ci.variant_id
            JOIN products p ON p.id = pv.product_id
            WHERE ci.user_id = ${userId}
            ORDER BY ci.created_at ASC
        `;
    },

    upsertItem: async (userId: number, variantId: number, quantity: number): Promise<void> => {
        await sql`
            INSERT INTO cart_items(user_id, variant_id, quantity)
            VALUES (${userId}, ${variantId}, ${quantity})
            ON CONFLICT (user_id, variant_id)
            DO UPDATE SET
                quantity = cart_items.quantity + EXCLUDED.quantity,
                updated_at = CURRENT_TIMESTAMP
        `;
    },

    updateQuantity: async (userId: number, variantId: number, quantity: number): Promise<boolean> => {
        const result = await sql`
            UPDATE cart_items
            SET quantity = ${quantity}, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ${userId} AND variant_id = ${variantId}
        `;
        return (result as any).count > 0;
    },

    removeItem: async (userId: number, variantId: number): Promise<boolean> => {
        const result = await sql`
            DELETE FROM cart_items WHERE user_id = ${userId} AND variant_id = ${variantId}
        `;
        return (result as any).count > 0;
    },

    clearCart: async (userId: number): Promise<void> => {
        await sql`DELETE FROM cart_items WHERE user_id = ${userId}`;
    },
};
