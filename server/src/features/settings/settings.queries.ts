import { sql } from '../../lib/db';

export interface OrderHandoverSettings {
    enabled: boolean;
    managerId: number | null;
}

export const settingsQueries = {
    getString: async (key: string): Promise<string | null> => {
        const [row] = await sql<{ value: string }[]>`
            SELECT value FROM settings WHERE key = ${key}
        `;
        return row?.value ?? null;
    },

    setString: async (key: string, value: string): Promise<string> => {
        const [row] = await sql<{ value: string }[]>`
            INSERT INTO settings (key, value)
            VALUES (${key}, ${value})
            ON CONFLICT (key) DO UPDATE
            SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
            RETURNING value
        `;
        return row?.value ?? value;
    },

    getNumber: async (key: string): Promise<number> => {
        return Number(await settingsQueries.getString(key) ?? 0);
    },

    setNumber: async (key: string, value: number): Promise<number> => {
        return Number(await settingsQueries.setString(key, String(value)));
    },

    getOrderHandover: async (): Promise<OrderHandoverSettings> => {
        const [enabledValue, managerIdValue] = await Promise.all([
            settingsQueries.getString('order_handover_enabled'),
            settingsQueries.getString('order_handover_manager_id'),
        ]);
        const managerId = managerIdValue ? Number(managerIdValue) : null;

        return {
            enabled: enabledValue === 'true',
            managerId: Number.isFinite(managerId) && managerId ? managerId : null,
        };
    },

    setOrderHandover: async (settings: OrderHandoverSettings): Promise<OrderHandoverSettings> => {
        await Promise.all([
            settingsQueries.setString('order_handover_enabled', settings.enabled ? 'true' : 'false'),
            settingsQueries.setString('order_handover_manager_id', settings.managerId ? String(settings.managerId) : ''),
        ]);
        return settings;
    },
};
