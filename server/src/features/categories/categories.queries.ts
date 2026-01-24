import { slugify } from '@server/lib/util';
import { sql } from '../../lib/db';
import type { Category } from 'shared/dist';

export const categoriesQueries = {
    findAll: async (): Promise<Category[]> => {
        return await sql<Category[]>`SELECT * FROM categories ORDER BY name ASC`;
    },
    findById: async (id: number): Promise<Category | undefined> => {
        const [category] = await sql<Category[]>`SELECT * FROM categories WHERE id = ${id}`;
        return category;
    },
    findBySlug: async (slug: string): Promise<Category | undefined> => {
        const [category] = await sql<Category[]>`SELECT * FROM categories WHERE slug = ${slug}`;
        return category;
    },
    create: async (name: string, slug: string, description: string | null): Promise<Category | undefined> => {
        const [category] = await sql<Category[]>`INSERT INTO categories(name, slug,description) VALUES (${name}, ${slug}, ${description}) RETURNING *`;
        return category;
    },

    update: async (id: number, data: { name?: string; slug?: string; description?: string }): Promise<Category | undefined> => {
        const updates: any = {};

        if (data.name !== undefined) {
            updates.name = data.name;
            updates.slug = data.slug || slugify(data.name);
        }
        if (data.description !== undefined) {
            updates.description = data.description;
        }
        const [category] = await sql<Category[]>`UPDATE categories SET ${sql(updates)} WHERE id = ${id} RETURNING *`;
        return category;
    },

    delete: async (id: number): Promise<void> => {
        await sql`DELETE FROM categories WHERE id = ${id}`;
    },

    countProducts: async (categoryId: number): Promise<number | undefined> => {
        const [result] = await sql<{ count: number }[]>`
        SELECT COUNT(*)::int as count  FROM products  WHERE category_id = ${categoryId}`;
        // @ts-ignore
        return result.count;
    },

    findWithProductCount: async (): Promise<Array<Category & { product_count: number }>> => {
        return await sql<Array<Category & { product_count: number }>>`
      SELECT c.*,COUNT(p.id)::int as product_count FROM categories c LEFT JOIN products p ON p.category_id = c.id GROUP BY c.id ORDER BY c.name ASC`;
    },

    search: async (term: string): Promise<Category[]> => {
        const searchTerm = `%${term}%`;
        return await sql<Category[]>`SELECT * FROM categories WHERE name ILIKE ${searchTerm}  OR description ILIKE ${searchTerm} ORDER BY name ASC`;
    },
}


