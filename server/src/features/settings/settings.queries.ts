import { sql } from '../../lib/db';
import type { StorefrontHero } from 'shared/dist';

export const HERO_DEFAULTS: Omit<StorefrontHero, 'image_url' | 'image_url_small'> = {
    eyebrow: 'The New Season',
    title: 'Crafted for\nthe discerning eye',
    subtitle: 'Handbags, shoes and silk — chosen slowly, made to be carried for years.',
};

const HERO_KEYS = {
    image_url: 'hero_image_url',
    image_url_small: 'hero_image_url_small',
    eyebrow: 'hero_eyebrow',
    title: 'hero_title',
    subtitle: 'hero_subtitle',
} as const;

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

    getStorefrontHero: async (): Promise<StorefrontHero> => {
        const rows = await sql<{ key: string; value: string }[]>`
            SELECT key, value FROM settings WHERE key IN ${sql(Object.values(HERO_KEYS))}
        `;
        const values = new Map(rows.map((row) => [row.key, row.value]));
        const read = (key: keyof typeof HERO_KEYS) => values.get(HERO_KEYS[key]) || null;

        return {
            image_url: read('image_url'),
            image_url_small: read('image_url_small'),
            eyebrow: read('eyebrow') ?? HERO_DEFAULTS.eyebrow,
            title: read('title') ?? HERO_DEFAULTS.title,
            subtitle: read('subtitle') ?? HERO_DEFAULTS.subtitle,
        };
    },

    setStorefrontHero: async (hero: StorefrontHero): Promise<StorefrontHero> => {
        await sql.begin(async (tx: typeof sql) => {
            for (const [field, key] of Object.entries(HERO_KEYS)) {
                const value = hero[field as keyof StorefrontHero] ?? '';
                await tx`
                    INSERT INTO settings (key, value)
                    VALUES (${key}, ${value})
                    ON CONFLICT (key) DO UPDATE
                    SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
                `;
            }
        });
        return settingsQueries.getStorefrontHero();
    },
};
