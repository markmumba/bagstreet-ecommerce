
import postgres from 'postgres';
import {env} from '../config/env'


export const sql = postgres(env.DATABASE_URL!,{
    max:10,
    idle_timeout:20,
    connect_timeout:10,
});


export async function initDatabase() {
    try {
        await sql`
        
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


        CREATE TABLE IF NOT EXISTS categories (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL UNIQUE,
            slug VARCHAR(100) NOT NULL UNIQUE,
            description,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP 
        );

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
            updated_at TIMESTAMP NOT NULL DEFAULT CURENT_TIMESTAMP  
        );

        CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
        CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
        CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
        CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);

        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN 
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $$ language 'plpgsql';
           
        DROP TRIGGER IF EXISTS update_categories_updated_at ON categories;
        CREATE TRIGGER update_categories_updated_at 
            BEFORE UPDATE ON categories
            FOR EACH ROW 
            EXECUTE FUNCTION update_updated_at_column();
        DROP TRIGGER IF EXISTS update_products_updated_at ON products;
        CREATE TRIGGER update_categories_updated_at
            BEFORE UPDATE ON categories
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
        `;

        console.log(`Database initialized successfully.`);
    }catch(error) {
        console.error("Database initialization failed: ",error);
        throw error;
    }
}

process.on('SIGINT', async() => {
    await sql.end();
    process.exit(0);
});

process.on('SIGTERM', async() => {
    await sql.end();
    process.exit(0);
})


