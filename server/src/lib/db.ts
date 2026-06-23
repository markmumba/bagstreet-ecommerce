
import { SQL } from 'bun';
import { env } from '../config/env';

export const sql = new SQL(env.DATABASE_URL);



export async function initDatabase() {
    try {
        await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;

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

        await sql`
            CREATE TABLE IF NOT EXISTS products (
                id  SERIAL PRIMARY KEY,
                category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
                sku VARCHAR(50) NOT NULL UNIQUE,
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

        await sql`
            CREATE TABLE IF NOT EXISTS product_variants (
                id SERIAL PRIMARY KEY,
                product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                sku VARCHAR(50) NOT NULL UNIQUE,
                size VARCHAR(20),
                color VARCHAR(50),
                stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
                price_override DECIMAL(10,2),
                is_active BOOLEAN NOT NULL DEFAULT true,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(200) NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                full_name VARCHAR(200) NOT NULL,
                role VARCHAR(50) NOT NULL CHECK (role IN ('CUSTOMER','ADMIN','MANAGER')),
                is_active BOOLEAN NOT NULL DEFAULT false,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS refresh_tokens (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token_hash TEXT NOT NULL UNIQUE,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
                status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','CONFIRMED','PROCESSING','SHIPPED','DELIVERED','CANCELLED','REFUNDED')),
                total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
                shipping_address JSONB NOT NULL,
                notes TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS order_items (
                id SERIAL PRIMARY KEY,
                order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
                quantity INTEGER NOT NULL CHECK (quantity > 0),
                unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
                subtotal DECIMAL(10,2) NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS cart_items (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                variant_id INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
                quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, variant_id)
            )
        `;

        await sql`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug)`;

        await sql`
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN 
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ language 'plpgsql'
        `;

        await sql`DROP TRIGGER IF EXISTS update_categories_updated_at ON categories`;
        await sql`
            CREATE TRIGGER update_categories_updated_at 
            BEFORE UPDATE ON categories
            FOR EACH ROW 
            EXECUTE FUNCTION update_updated_at_column()
        `;

        await sql`DROP TRIGGER IF EXISTS update_products_updated_at ON products`;

        await sql`
            CREATE TRIGGER update_products_updated_at
            BEFORE UPDATE ON products
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column()
        `;

        await sql`CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants(product_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_product_variants_sku ON product_variants(sku)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON cart_items(user_id)`;

        // Additive order_items columns for variant snapshot
        await sql`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id INTEGER REFERENCES product_variants(id) ON DELETE RESTRICT`;
        await sql`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_sku VARCHAR(50)`;
        await sql`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_size VARCHAR(20)`;
        await sql`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_color VARCHAR(50)`;

        await sql`DROP TRIGGER IF EXISTS update_product_variants_updated_at ON product_variants`;
        await sql`
            CREATE TRIGGER update_product_variants_updated_at
            BEFORE UPDATE ON product_variants
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column()
        `;

        await sql`DROP TRIGGER IF EXISTS update_cart_items_updated_at ON cart_items`;
        await sql`
            CREATE TRIGGER update_cart_items_updated_at
            BEFORE UPDATE ON cart_items
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column()
        `;

        await sql`DROP TRIGGER IF EXISTS update_orders_updated_at ON orders`;
        await sql`
            CREATE TRIGGER update_orders_updated_at
            BEFORE UPDATE ON orders
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column()
        `;

        await sql`DROP TRIGGER IF EXISTS update_users_updated_at ON users`;

        await sql`
            CREATE TRIGGER update_users_updated_at
            BEFORE UPDATE ON users
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


