
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

        // Featured products
        await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false`;
        await sql`CREATE INDEX IF NOT EXISTS idx_products_is_featured ON products(is_featured)`;

        // Hierarchical categories
        await sql`ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT`;
        await sql`CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id)`;

        // Additive products columns
        await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS sku VARCHAR(50)`;
        await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS slug VARCHAR(200)`;
        await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT`;
        await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`;

        // Additive order_items columns for variant snapshot
        await sql`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id INTEGER REFERENCES product_variants(id) ON DELETE RESTRICT`;
        await sql`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_sku VARCHAR(50)`;
        await sql`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_size VARCHAR(20)`;
        await sql`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_color VARCHAR(50)`;

        // In-app notifications
        await sql`
            CREATE TABLE IF NOT EXISTS in_app_notifications (
                id SERIAL PRIMARY KEY,
                recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                type VARCHAR(50) NOT NULL DEFAULT 'NEW_ORDER',
                title VARCHAR(255) NOT NULL,
                body TEXT,
                data JSONB,
                is_read BOOLEAN NOT NULL DEFAULT false,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await sql`CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id ON in_app_notifications(recipient_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_notifications_unread ON in_app_notifications(recipient_id, is_read)`;

        // User invitations
        await sql`
            CREATE TABLE IF NOT EXISTS user_invitations (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token_hash TEXT NOT NULL UNIQUE,
                expires_at TIMESTAMP NOT NULL,
                used_at TIMESTAMP,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await sql`CREATE INDEX IF NOT EXISTS idx_user_invitations_token_hash ON user_invitations(token_hash)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_user_invitations_user_id ON user_invitations(user_id)`;

        // Password reset tokens
        await sql`
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token_hash TEXT NOT NULL UNIQUE,
                expires_at TIMESTAMP NOT NULL,
                used_at TIMESTAMP,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await sql`CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens(token_hash)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id)`;

        // Per-variant low stock threshold
        await sql`ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER NOT NULL DEFAULT 5`;
        await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_price DECIMAL(10,2) CHECK (sale_price IS NULL OR sale_price >= 0)`;
        await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_ends_at TIMESTAMP`;

        // Inventory movements audit trail
        await sql`
            CREATE TABLE IF NOT EXISTS inventory_movements (
                id SERIAL PRIMARY KEY,
                variant_id INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
                delta INTEGER NOT NULL,
                reason VARCHAR(50) NOT NULL CHECK (reason IN ('ORDER_PLACED','ORDER_CANCELLED','ADMIN_ADJUSTMENT','RESTOCK')),
                reference_id INTEGER,
                note TEXT,
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await sql`CREATE INDEX IF NOT EXISTS idx_inventory_movements_variant_id ON inventory_movements(variant_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_at ON inventory_movements(created_at DESC)`;

        // Shipping locations
        await sql`
            CREATE TABLE IF NOT EXISTS shipping_locations (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
                is_active BOOLEAN NOT NULL DEFAULT true,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await sql`DROP TRIGGER IF EXISTS update_shipping_locations_updated_at ON shipping_locations`;
        await sql`
            CREATE TRIGGER update_shipping_locations_updated_at
            BEFORE UPDATE ON shipping_locations
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column()
        `;

        // M-Pesa transactions
        await sql`
            CREATE TABLE IF NOT EXISTS mpesa_transactions (
                id SERIAL PRIMARY KEY,
                order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
                checkout_request_id TEXT NOT NULL UNIQUE,
                merchant_request_id TEXT NOT NULL,
                phone VARCHAR(20) NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'INITIATED'
                    CHECK (status IN ('INITIATED','COMPLETED','FAILED','CANCELLED')),
                result_code INTEGER,
                result_desc TEXT,
                mpesa_receipt_number TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await sql`CREATE INDEX IF NOT EXISTS idx_mpesa_transactions_order_id ON mpesa_transactions(order_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_mpesa_transactions_checkout_request_id ON mpesa_transactions(checkout_request_id)`;

        await sql`DROP TRIGGER IF EXISTS update_mpesa_transactions_updated_at ON mpesa_transactions`;
        await sql`
            CREATE TRIGGER update_mpesa_transactions_updated_at
            BEFORE UPDATE ON mpesa_transactions
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column()
        `;

        // C2B payments received through the M-Pesa validation/confirmation callbacks.
        await sql`
            CREATE TABLE IF NOT EXISTS mpesa_c2b_payments (
                id SERIAL PRIMARY KEY,
                transaction_id TEXT NOT NULL UNIQUE,
                phone VARCHAR(20) NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                bill_ref_number TEXT,
                raw_payload JSONB NOT NULL,
                matched_order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await sql`CREATE INDEX IF NOT EXISTS idx_mpesa_c2b_payments_phone_amount ON mpesa_c2b_payments(phone, amount)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_mpesa_c2b_payments_created_at ON mpesa_c2b_payments(created_at DESC)`;

        // Alter orders: shipping location, cost, payment status
        await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_location_id INTEGER REFERENCES shipping_locations(id) ON DELETE RESTRICT`;
        await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_cost DECIMAL(10,2) NOT NULL DEFAULT 0`;
        await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID','PAID','FAILED'))`;
        await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_code VARCHAR(50)`;
        await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0`;
        await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name VARCHAR(100)`;
        await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(20)`;
        await sql`ALTER TABLE orders ALTER COLUMN user_id DROP NOT NULL`;

        // Promotions
        await sql`
            CREATE TABLE IF NOT EXISTS discount_codes (
                id SERIAL PRIMARY KEY,
                code VARCHAR(50) NOT NULL UNIQUE,
                value DECIMAL(5,2) NOT NULL CHECK (value > 0 AND value <= 100),
                min_order_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
                usage_limit INTEGER CHECK (usage_limit IS NULL OR usage_limit > 0),
                used_count INTEGER NOT NULL DEFAULT 0,
                expires_at TIMESTAMP,
                is_active BOOLEAN NOT NULL DEFAULT true,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS discount_code_usages (
                id SERIAL PRIMARY KEY,
                code_id INTEGER NOT NULL REFERENCES discount_codes(id) ON DELETE RESTRICT,
                order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
                phone VARCHAR(20) NOT NULL,
                discount_amount DECIMAL(10,2) NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (code_id, phone)
            )
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS settings (
                key VARCHAR(100) PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await sql`
            INSERT INTO settings (key, value)
            VALUES ('free_delivery_threshold', '0')
            ON CONFLICT (key) DO NOTHING
        `;

        await sql`CREATE INDEX IF NOT EXISTS idx_discount_codes_code ON discount_codes(code)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_discount_code_usages_phone ON discount_code_usages(phone)`;

        await sql`DROP TRIGGER IF EXISTS update_discount_codes_updated_at ON discount_codes`;
        await sql`
            CREATE TRIGGER update_discount_codes_updated_at
            BEFORE UPDATE ON discount_codes
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column()
        `;

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
