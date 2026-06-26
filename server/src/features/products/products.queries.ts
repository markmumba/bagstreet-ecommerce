import { sql } from "../../lib/db";
import type { Product, ProductRequest, ProductUpdateRequest } from "shared/dist";

export const productsQueries = {
    findAll: async (
        page: number,
        limit: number,
        categoryId: number | null,
        searchTerm: string,
        status: boolean | null
    ): Promise<(Product & { total_stock: number | null })[]> => {
        const offset = (page - 1) * limit;

        const pattern = searchTerm && searchTerm.trim() !== ""
            ? `%${searchTerm.trim()}%`
            : null;

        return await sql<(Product & { total_stock: number | null })[]>`
            WITH RECURSIVE descendants AS (
                SELECT id FROM categories WHERE ${categoryId}::integer IS NOT NULL AND id = ${categoryId}::integer
                UNION ALL
                SELECT c.id FROM categories c JOIN descendants d ON c.parent_id = d.id
            )
            SELECT p.*,
                COALESCE(SUM(pv.stock) FILTER (WHERE pv.is_active = true), 0) AS total_stock
            FROM products p
            LEFT JOIN product_variants pv ON pv.product_id = p.id
            WHERE (${categoryId}::integer IS NULL OR p.category_id IN (SELECT id FROM descendants))
              AND (${pattern}::text IS NULL OR p.name ILIKE ${pattern}::text)
              AND (${status}::boolean IS NULL OR p.is_active = ${status}::boolean)
            GROUP BY p.id
            ORDER BY p.name ASC
            LIMIT ${limit} OFFSET ${offset}
        `;
    },

    countAll: async (
        categoryId: number | null,
        searchTerm: string
    ): Promise<number> => {
        const pattern = searchTerm && searchTerm.trim() !== ""
            ? `%${searchTerm.trim()}%`
            : null;

        const [result] = await sql<[{ count: string }]>`
            WITH RECURSIVE descendants AS (
                SELECT id FROM categories WHERE ${categoryId}::integer IS NOT NULL AND id = ${categoryId}::integer
                UNION ALL
                SELECT c.id FROM categories c JOIN descendants d ON c.parent_id = d.id
            )
            SELECT COUNT(*) as count
            FROM products
            WHERE (${categoryId}::integer IS NULL OR category_id IN (SELECT id FROM descendants))
              AND (${pattern}::text IS NULL OR name ILIKE ${pattern}::text)
        `;
        return parseInt(result.count, 10);
    },

    findById: async (id: number): Promise<Product | undefined> => {
        const [product] = await sql<Product[]>`SELECT * FROM products WHERE id = ${id} AND is_active=true`;
        return product;
    },

    findByIdAnyStatus: async (id: number): Promise<Product | undefined> => {
        const [product] = await sql<Product[]>`SELECT * FROM products WHERE id = ${id}`;
        return product;
    },

    findBySlug: async (slug: string): Promise<Product | undefined> => {
        const [product] = await sql<Product[]>`SELECT * FROM products WHERE slug = ${slug} AND is_active=true`;
        return product;
    },

    create: async (product: ProductRequest & { sku: string; slug: string }): Promise<Product | undefined> => {
        const result = await sql<Product[]>`INSERT INTO products
         (category_id, name, description, sku, slug, price, stock, image_url, is_active)
        VALUES
        (${product.category_id}, ${product.name}, ${product.description ?? null}, ${product.sku}, ${product.slug}, ${product.price}, ${product.stock ?? 0}, ${product.image_url ?? null}, ${product.is_active}) RETURNING *`;
        const [newProduct] = result;
        return newProduct;
    },

    update: async (id: number, product: { name?: string; description?: string; price?: number; image_url?: string; is_active?: boolean; is_featured?: boolean; sale_price?: number | null; sale_ends_at?: string | null }): Promise<Product | undefined> => {
        const [updatedProduct] = await sql<Product[]>`UPDATE products SET ${sql(product)} WHERE id = ${id} RETURNING *`;
        return updatedProduct;
    },

    setSale: async (id: number, data: { sale_price: number | null; sale_ends_at?: string | null }): Promise<Product | undefined> => {
        const [updatedProduct] = await sql<Product[]>`
            UPDATE products
            SET sale_price = ${data.sale_price}, sale_ends_at = ${data.sale_price == null ? null : data.sale_ends_at ?? null}
            WHERE id = ${id}
            RETURNING *
        `;
        return updatedProduct;
    },

    findOnSale: async (): Promise<Product[]> => {
        return await sql<Product[]>`
            SELECT * FROM products
            WHERE is_active = true
              AND sale_price IS NOT NULL
              AND (sale_ends_at IS NULL OR sale_ends_at > NOW())
            ORDER BY sale_ends_at ASC NULLS LAST, name ASC
        `;
    },

    deactivate: async(id:number): Promise<void> => {
        await sql`UPDATE products SET is_active=false WHERE id=${id}`;
    },
    delete: async (id: number): Promise<void> => {
        await sql`DELETE FROM products WHERE id = ${id}`;
    },

    bulkDelete: async (productIds: []): Promise<void> => {
        await sql`DELETE FROM products WHERE id IN (productIds = ${productIds})`;
    },
};
