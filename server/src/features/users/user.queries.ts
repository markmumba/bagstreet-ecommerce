import type { User } from 'shared/dist';
import { sql } from '../../lib/db';

interface InvitationRow {
    id: number;
    user_id: number;
    token_hash: string;
    expires_at: Date;
    used_at: Date | null;
    created_at: Date;
}

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
            WHERE (${pattern}::text IS NULL OR full_name ILIKE ${pattern}::text OR email ILIKE ${pattern}::text)
              AND (${role}::text IS NULL OR role = ${role}::text)
              AND (${isActive}::boolean IS NULL OR is_active = ${isActive}::boolean)
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
            WHERE (${pattern}::text IS NULL OR full_name ILIKE ${pattern}::text OR email ILIKE ${pattern}::text)
              AND (${role}::text IS NULL OR role = ${role}::text)
              AND (${isActive}::boolean IS NULL OR is_active = ${isActive}::boolean)
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

    createInvitation: async (userId: number, tokenHash: string, expiresAt: Date): Promise<void> => {
        await sql`
            INSERT INTO user_invitations(user_id, token_hash, expires_at)
            VALUES (${userId}, ${tokenHash}, ${expiresAt})
        `;
    },

    findInvitationByTokenHash: async (hash: string): Promise<InvitationRow | undefined> => {
        const [row] = await sql<InvitationRow[]>`
            SELECT * FROM user_invitations
            WHERE token_hash = ${hash}
              AND expires_at > NOW()
              AND used_at IS NULL
        `;
        return row;
    },

    consumeInvitation: async (id: number): Promise<void> => {
        await sql`UPDATE user_invitations SET used_at = NOW() WHERE id = ${id}`;
    },

    activateWithPassword: async (userId: number, passwordHash: string): Promise<User | undefined> => {
        const [user] = await sql<User[]>`
            UPDATE users SET password_hash = ${passwordHash}, is_active = true, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${userId}
            RETURNING id, email, full_name, role, is_active, created_at, updated_at
        `;
        return user;
    },
};
