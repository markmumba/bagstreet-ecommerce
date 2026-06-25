import { sql } from '../../lib/db';

interface ShippingLocationRow {
    id: number;
    name: string;
    price: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export const shippingQueries = {
    findAllActive: async (): Promise<ShippingLocationRow[]> => {
        return sql<ShippingLocationRow[]>`
            SELECT * FROM shipping_locations WHERE is_active = true ORDER BY name ASC
        `;
    },

    findAll: async (): Promise<ShippingLocationRow[]> => {
        return sql<ShippingLocationRow[]>`
            SELECT * FROM shipping_locations ORDER BY name ASC
        `;
    },

    findById: async (id: number): Promise<ShippingLocationRow | undefined> => {
        const [row] = await sql<ShippingLocationRow[]>`
            SELECT * FROM shipping_locations WHERE id = ${id}
        `;
        return row;
    },

    create: async (data: { name: string; price: number; is_active?: boolean }): Promise<ShippingLocationRow> => {
        const [row] = await sql<ShippingLocationRow[]>`
            INSERT INTO shipping_locations (name, price, is_active)
            VALUES (${data.name}, ${data.price}, ${data.is_active ?? true})
            RETURNING *
        `;
        return row!;
    },

    update: async (id: number, data: { name?: string; price?: number; is_active?: boolean }): Promise<ShippingLocationRow | undefined> => {
        const [row] = await sql<ShippingLocationRow[]>`
            UPDATE shipping_locations
            SET
                name = COALESCE(${data.name ?? null}, name),
                price = COALESCE(${data.price ?? null}, price),
                is_active = COALESCE(${data.is_active ?? null}, is_active)
            WHERE id = ${id}
            RETURNING *
        `;
        return row;
    },

    delete: async (id: number): Promise<void> => {
        await sql`DELETE FROM shipping_locations WHERE id = ${id}`;
    },
};
