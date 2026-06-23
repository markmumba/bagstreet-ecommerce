import type { User } from 'shared/dist';
import { sql } from '../../lib/db';

export const UsersQueries = {
    findAll: async (
        page: number,
        limit: number,
        search: string,
        role: string | null,
        isActive: boolean | null
    ): Promise<User[]> => {
        const offset = (page - 1) * limit;
        const pattern = search.trim() !== '' ? `%${search.trim()}%` : null;
        return await sql<User[]>`
            SELECT id, email, full_name, role, is_active, created_at, updated_at FROM users
            WHERE (${pattern} IS NULL OR full_name ILIKE ${pattern} OR email ILIKE ${pattern})
              AND (${role} IS NULL OR role = ${role})
              AND (${isActive} IS NULL OR is_active = ${isActive})
            ORDER BY created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `;
    },

    countAll: async (
        search: string,
        role: string | null,
        isActive: boolean | null
    ): Promise<number> => {
        const pattern = search.trim() !== '' ? `%${search.trim()}%` : null;
        const [result] = await sql<[{ count: string }]>`
            SELECT COUNT(*) as count FROM users
            WHERE (${pattern} IS NULL OR full_name ILIKE ${pattern} OR email ILIKE ${pattern})
              AND (${role} IS NULL OR role = ${role})
              AND (${isActive} IS NULL OR is_active = ${isActive})
        `;
        return parseInt(result.count, 10);
    },

    findById: async (id: number): Promise<User | undefined> => {
        const [user] = await sql<User[]>`SELECT id, email, full_name, role, is_active, created_at, updated_at FROM users WHERE id = ${id}`;
        return user;
    },

    findByEmail: async (email: string): Promise<User | undefined> => {
        const [user] = await sql<User[]>`SELECT * FROM users WHERE email = ${email}`;
        return user;
    },

    create: async (data: {
        email: string;
        full_name: string;
        password_hash: string;
        role: string;
    }): Promise<User | undefined> => {
        const [user] = await sql<User[]>`
            INSERT INTO users(email, full_name, password_hash, role, is_active)
            VALUES (${data.email}, ${data.full_name}, ${data.password_hash}, ${data.role}, false)
            RETURNING id, email, full_name, role, is_active, created_at, updated_at
        `;
        return user;
    },

    update: async (id: number, data: { full_name?: string; role?: string; is_active?: boolean }): Promise<User | undefined> => {
        const [user] = await sql<User[]>`
            UPDATE users SET ${sql(data)}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${id}
            RETURNING id, email, full_name, role, is_active, created_at, updated_at
        `;
        return user;
    },

    delete: async (id: number): Promise<void> => {
        await sql`DELETE FROM users WHERE id = ${id}`;
    },
};
