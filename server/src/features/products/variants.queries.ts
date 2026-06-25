import { sql } from '../../lib/db';

export interface ProductVariantRow {
    id: number;
    product_id: number;
    sku: string;
    size: string | null;
    color: string | null;
    stock: number;
    low_stock_threshold: number;
    price_override: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export const variantsQueries = {
    findByProductId: async (productId: number): Promise<ProductVariantRow[]> => {
        return await sql<ProductVariantRow[]>`
            SELECT * FROM product_variants WHERE product_id = ${productId} ORDER BY id ASC
        `;
    },

    findById: async (id: number): Promise<ProductVariantRow | undefined> => {
        const [variant] = await sql<ProductVariantRow[]>`
            SELECT * FROM product_variants WHERE id = ${id}
        `;
        return variant;
    },

    create: async (
        productId: number,
        data: { size?: string; color?: string; stock: number; low_stock_threshold?: number; price_override?: number; is_active: boolean },
        sku: string
    ): Promise<ProductVariantRow> => {
        const [variant] = await sql<ProductVariantRow[]>`
            INSERT INTO product_variants (product_id, sku, size, color, stock, low_stock_threshold, price_override, is_active)
            VALUES (
                ${productId},
                ${sku},
                ${data.size ?? null},
                ${data.color ?? null},
                ${data.stock},
                ${data.low_stock_threshold ?? 5},
                ${data.price_override ?? null},
                ${data.is_active}
            )
            RETURNING *
        `;
        if (!variant) throw new Error('Failed to create variant');
        return variant;
    },

    update: async (
        id: number,
        data: { size?: string; color?: string; stock?: number; price_override?: number | null; is_active?: boolean; low_stock_threshold?: number }
    ): Promise<ProductVariantRow | undefined> => {
        const fields: Record<string, unknown> = {};
        if (data.size !== undefined) fields.size = data.size;
        if (data.color !== undefined) fields.color = data.color;
        if (data.stock !== undefined) fields.stock = data.stock;
        if ('price_override' in data) fields.price_override = data.price_override ?? null;
        if (data.is_active !== undefined) fields.is_active = data.is_active;
        if (data.low_stock_threshold !== undefined) fields.low_stock_threshold = data.low_stock_threshold;

        if (Object.keys(fields).length === 0) return variantsQueries.findById(id);

        const [variant] = await sql<ProductVariantRow[]>`
            UPDATE product_variants SET ${sql(fields)} WHERE id = ${id} RETURNING *
        `;
        return variant;
    },

    delete: async (id: number): Promise<void> => {
        await sql`DELETE FROM product_variants WHERE id = ${id}`;
    },

    hasCartRefs: async (id: number): Promise<boolean> => {
        const [{ count }] = await sql<[{ count: string }]>`
            SELECT COUNT(*) as count FROM cart_items WHERE variant_id = ${id}
        `;
        return parseInt(count, 10) > 0;
    },

    hasOrderRefs: async (id: number): Promise<boolean> => {
        const [{ count }] = await sql<[{ count: string }]>`
            SELECT COUNT(*) as count FROM order_items WHERE variant_id = ${id}
        `;
        return parseInt(count, 10) > 0;
    },
};
