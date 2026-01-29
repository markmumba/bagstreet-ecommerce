import { sql } from "../../lib/db";
import type { Product, ProductRequest, ProductUpdateRequest } from "shared/dist";

export const productsQueries = {
    findAll: async (
        page: number,
        limit: number,
        categoryId: number | null,
        searchTerm: string
    ): Promise<Product[]> => {
        const offset = (page - 1) * limit;

        const pattern = searchTerm && searchTerm.trim() !== ""
            ? `%${searchTerm.trim()}%`
            : null;

        const products = await sql<Product[]>`
            SELECT * FROM products
            WHERE (${categoryId} IS NULL OR category_id = ${categoryId})
              AND (${pattern} IS NULL OR name ILIKE ${pattern})
            ORDER BY name ASC
            LIMIT ${limit} OFFSET ${offset}
        `;
        return products;
    },

    countAll: async (
        categoryId: number | null,
        searchTerm: string
    ): Promise<number> => {
        const pattern = searchTerm && searchTerm.trim() !== ""
            ? `%${searchTerm.trim()}%`
            : null;

        const [result] = await sql<[{ count: string }]>`
            SELECT COUNT(*) as count
            FROM products
            WHERE (${categoryId} IS NULL OR category_id = ${categoryId})
              AND (${pattern} IS NULL OR name ILIKE ${pattern})
        `;
        return parseInt(result.count, 10);
    },

    findById: async (id: number): Promise<Product | undefined> => {
        const [product] = await sql<Product[]>`SELECT * FROM products WHERE id = ${id}`;
        return product;
    },

    findBySlug: async (slug: string): Promise<Product | undefined> => {
        const [product] = await sql<Product[]>`SELECT * FROM products WHERE slug = ${slug}`;
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
    update: async (id: number, product: { name?: string; description?: string; price?: number }): Promise<Product | undefined> => {
        const [updatedProduct] = await sql<Product[]>`UPDATE products SET ${sql(product)} WHERE id = ${id} RETURNING *`;
        return updatedProduct;
    },
    delete: async (id: number): Promise<void> => {
        await sql`DELETE FROM products WHERE id = ${id}`;

    }
}