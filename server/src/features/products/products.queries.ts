import { sql } from "../../lib/db";
import type { Product, ProductRequest } from "shared/dist";



export const productsQueries = {
    findAll: async (): Promise<Product[]> => {
        return await sql<Product[]>`SELECT * FROM products ORDER BY name ASC`;
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
    update: async (id: number, product: Product): Promise<Product | undefined> => {
        const [updatedProduct] = await sql<Product[]>`UPDATE products SET name = ${product.name}, description = ${product.description}, price = ${product.price}, stock = ${product.stock}, image_url = ${product.image_url}, is_active = ${product.is_active} WHERE id = ${id} RETURNING *`;
        return updatedProduct;
    },
    delete: async (id: number): Promise<void> => {
        await sql`DELETE FROM products WHERE id = ${id}`;

    },
    findByCategoryId: async (categoryId: number): Promise<Product[]> => {
        return await sql<Product[]>`SELECT * FROM products WHERE category_id = ${categoryId} ORDER BY name ASC`;
    },
}