import { sql } from '../../lib/db';

export const settingsQueries = {
    getNumber: async (key: string): Promise<number> => {
        const [row] = await sql<{ value: string }[]>`
            SELECT value FROM settings WHERE key = ${key}
        `;
        return Number(row?.value ?? 0);
    },

    setNumber: async (key: string, value: number): Promise<number> => {
        const [row] = await sql<{ value: string }[]>`
            INSERT INTO settings (key, value)
            VALUES (${key}, ${String(value)})
            ON CONFLICT (key) DO UPDATE
            SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
            RETURNING value
        `;
        return Number(row?.value ?? value);
    },
};
