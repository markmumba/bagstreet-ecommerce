import type { Migration } from './types';

export const publicIdentifiersMigration: Migration = {
    id: '005',
    name: 'public_identifiers',
    async up(sql) {
        await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;

        await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS public_id UUID`;
        await sql`UPDATE orders SET public_id = uuid_generate_v4() WHERE public_id IS NULL`;
        await sql`ALTER TABLE orders ALTER COLUMN public_id SET DEFAULT uuid_generate_v4()`;
        await sql`ALTER TABLE orders ALTER COLUMN public_id SET NOT NULL`;
        await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_public_id ON orders(public_id)`;

        await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number VARCHAR(24)`;
        await sql`
            UPDATE orders
            SET order_number = 'BS-' || UPPER(SUBSTRING(REPLACE(public_id::text, '-', '') FROM 1 FOR 8))
            WHERE order_number IS NULL
        `;
        await sql`ALTER TABLE orders ALTER COLUMN order_number SET NOT NULL`;
        await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number)`;

        await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_products_slug_unique ON products(slug)`;
    },
};
