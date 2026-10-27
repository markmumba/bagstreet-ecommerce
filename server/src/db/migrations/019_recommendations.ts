import type { Migration } from './types';

/**
 * Product recommendations (roadmap section 4, 20 Oct 2026). Staff pick what goes with a product
 * ("Complete the look"); categories that go together fill in when they haven't. Recommendation
 * use is counted per day and rail only: no record of who saw or clicked what.
 */
export const recommendationsMigration: Migration = {
    id: '019',
    name: 'recommendations',
    async up(sql) {
        await sql`
            CREATE TABLE IF NOT EXISTS product_pairings (
                product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                paired_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                position SMALLINT NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (product_id, paired_product_id),
                CHECK (product_id <> paired_product_id)
            )
        `;
        await sql`
            CREATE TABLE IF NOT EXISTS category_pairings (
                category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
                paired_category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
                position SMALLINT NOT NULL DEFAULT 0,
                PRIMARY KEY (category_id, paired_category_id),
                CHECK (category_id <> paired_category_id)
            )
        `;
        await sql`
            CREATE TABLE IF NOT EXISTS recommendation_stats (
                day DATE NOT NULL,
                rail VARCHAR(30) NOT NULL,
                impressions INTEGER NOT NULL DEFAULT 0,
                clicks INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (day, rail)
            )
        `;

        // A starting map for the launch categories; the owner adjusts it in admin.
        const defaults: [string, string[]][] = [
            ['bags', ['scarves', 'shoes']],
            ['shoes', ['bags', 'scarves']],
            ['scarves', ['bags', 'pajamas']],
            ['pajamas', ['scarves']],
        ];
        const [{ n }] = await sql`SELECT count(*)::int AS n FROM category_pairings`;
        if (Number(n) === 0) {
            for (const [from, tos] of defaults) {
                for (const [position, to] of tos.entries()) {
                    await sql`
                        INSERT INTO category_pairings (category_id, paired_category_id, position)
                        SELECT a.id, b.id, ${position} FROM categories a, categories b
                        WHERE a.slug = ${from} AND b.slug = ${to} AND a.parent_id IS NULL AND b.parent_id IS NULL
                        ON CONFLICT DO NOTHING
                    `;
                }
            }
        }
    },
};
