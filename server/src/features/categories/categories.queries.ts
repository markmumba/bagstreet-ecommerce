import { slugify } from '@server/lib/util';
import { sql } from '../../lib/db';
import type { Category } from 'shared/dist';

export const categoriesQueries = {
    findAll: async (page: number, limit: number, search: string): Promise<Category[]> => {
        const offset = (page - 1) * limit;
        const pattern = search.trim() !== '' ? `%${search.trim()}%` : null;
        return await sql<Category[]>`
            SELECT * FROM categories
            WHERE (${pattern} IS NULL OR name ILIKE ${pattern} OR description ILIKE ${pattern})
            ORDER BY name ASC
            LIMIT ${limit} OFFSET ${offset}
        `;
    },

    countAll: async (search: string): Promise<number> => {
        const pattern = search.trim() !== '' ? `%${search.trim()}%` : null;
        const [result] = await sql<[{ count: string }]>`
            SELECT COUNT(*) as count FROM categories
            WHERE (${pattern} IS NULL OR name ILIKE ${pattern} OR description ILIKE ${pattern})
        `;
        return parseInt(result.count, 10);
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
        const [category] = await sql<Category[]>`
            INSERT INTO categories(name, slug, description) VALUES (${name}, ${slug}, ${description}) RETURNING *
        `;
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
            SELECT COUNT(*)::int as count FROM products WHERE category_id = ${categoryId}
        `;
        return result?.count ?? 0;
    },
};
