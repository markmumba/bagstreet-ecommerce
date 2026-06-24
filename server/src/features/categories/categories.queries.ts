import { slugify } from '@server/lib/util';
import { sql } from '../../lib/db';
import type { Category } from 'shared/dist';

export const categoriesQueries = {
    findAll: async (page: number, limit: number, search: string): Promise<(Category & { parent_name: string | null; children_count: number })[]> => {
        const offset = (page - 1) * limit;
        const pattern = search.trim() !== '' ? `%${search.trim()}%` : null;
        return await sql<(Category & { parent_name: string | null; children_count: number })[]>`
            SELECT c.*,
                p.name AS parent_name,
                (SELECT COUNT(*)::int FROM categories WHERE parent_id = c.id) AS children_count
            FROM categories c
            LEFT JOIN categories p ON c.parent_id = p.id
            WHERE (${pattern}::text IS NULL OR c.name ILIKE ${pattern}::text OR c.description ILIKE ${pattern}::text)
            ORDER BY c.name ASC
            LIMIT ${limit} OFFSET ${offset}
        `;
    },

    countAll: async (search: string): Promise<number> => {
        const pattern = search.trim() !== '' ? `%${search.trim()}%` : null;
        const [result] = await sql<[{ count: string }]>`
            SELECT COUNT(*) as count FROM categories
            WHERE (${pattern}::text IS NULL OR name ILIKE ${pattern}::text OR description ILIKE ${pattern}::text)
        `;
        return parseInt(result.count, 10);
    },

    findById: async (id: number): Promise<(Category & { parent_name: string | null; children_count: number }) | undefined> => {
        const [category] = await sql<(Category & { parent_name: string | null; children_count: number })[]>`
            SELECT c.*,
                p.name AS parent_name,
                (SELECT COUNT(*)::int FROM categories WHERE parent_id = c.id) AS children_count
            FROM categories c
            LEFT JOIN categories p ON c.parent_id = p.id
            WHERE c.id = ${id}
        `;
        return category;
    },

    findBySlug: async (slug: string): Promise<Category | undefined> => {
        const [category] = await sql<Category[]>`SELECT * FROM categories WHERE slug = ${slug}`;
        return category;
    },

    create: async (name: string, slug: string, description: string | null, parentId: number | null): Promise<Category | undefined> => {
        const [category] = await sql<Category[]>`
            INSERT INTO categories(name, slug, description, parent_id) VALUES (${name}, ${slug}, ${description}, ${parentId}) RETURNING *
        `;
        return category;
    },

    update: async (id: number, data: { name?: string; slug?: string; description?: string; parent_id?: number | null }): Promise<Category | undefined> => {
        const updates: any = {};
        if (data.name !== undefined) {
            updates.name = data.name;
            updates.slug = data.slug || slugify(data.name);
        }
        if (data.description !== undefined) {
            updates.description = data.description;
        }
        if ('parent_id' in data) {
            updates.parent_id = data.parent_id;
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

    countChildren: async (id: number): Promise<number> => {
        const [result] = await sql<[{ count: number }]>`
            SELECT COUNT(*)::int as count FROM categories WHERE parent_id = ${id}
        `;
        return result?.count ?? 0;
    },

    findDescendantIds: async (categoryId: number): Promise<{ id: number }[]> => {
        return await sql<{ id: number }[]>`
            WITH RECURSIVE descendants AS (
                SELECT id FROM categories WHERE id = ${categoryId}
                UNION ALL
                SELECT c.id FROM categories c JOIN descendants d ON c.parent_id = d.id
            )
            SELECT id FROM descendants
        `;
    },

    findAllFlat: async (): Promise<(Category & { parent_name: string | null; children_count: number })[]> => {
        return await sql<(Category & { parent_name: string | null; children_count: number })[]>`
            SELECT c.*,
                p.name AS parent_name,
                (SELECT COUNT(*)::int FROM categories WHERE parent_id = c.id) AS children_count
            FROM categories c
            LEFT JOIN categories p ON c.parent_id = p.id
            ORDER BY c.parent_id NULLS FIRST, c.name
        `;
    },
};
