
import postgres from 'postgres';
import { env } from '../config/env'


export const sql = postgres(env.DATABASE_URL, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
});


export async function initDatabase() {
    try {
        // Create extension
        await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;

        // Create categories table
        await sql`
            CREATE TABLE IF NOT EXISTS categories (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                slug VARCHAR(100) NOT NULL UNIQUE,
                description TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP 
            )
        `;

        // Create products table
        await sql`
            CREATE TABLE IF NOT EXISTS products (
                id  SERIAL PRIMARY KEY,
                category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
                name VARCHAR(200) NOT NULL,
                slug VARCHAR(200) NOT NULL,
                description TEXT,
                price DECIMAL(10,2) NOT NULL CHECK (price >=0),
                stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >=0),
                image_url TEXT,
                is_active BOOLEAN NOT NULL DEFAULT true,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP  
            )
        `;

        // Create indexes
        await sql`CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug)`;

        // Create function for updating updated_at column
        await sql`
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN 
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ language 'plpgsql'
        `;

        // Create triggers for categories
        await sql`DROP TRIGGER IF EXISTS update_categories_updated_at ON categories`;
        await sql`
            CREATE TRIGGER update_categories_updated_at 
            BEFORE UPDATE ON categories
            FOR EACH ROW 
            EXECUTE FUNCTION update_updated_at_column()
        `;

        // Create triggers for products
        await sql`DROP TRIGGER IF EXISTS update_products_updated_at ON products`;
        await sql`
            CREATE TRIGGER update_products_updated_at
            BEFORE UPDATE ON products
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column()
        `;

        console.log(`Database initialized successfully.`);
    } catch (error) {
        console.error("Database initialization failed: ", error);
        throw error;
    }
}

process.on('SIGINT', async () => {
    await sql.end();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await sql.end();
    process.exit(0);
})


