import type { Migration } from './types';

/**
 * Product reviews (roadmap section 4, decided 20 Oct 2026): verified buyers only, one review per
 * product per order, approved by staff before it shows. `orders.delivered_at` dates the review
 * invitation email (sent 5 days after an order is received).
 */
export const productReviewsMigration: Migration = {
    id: '018',
    name: 'product_reviews',
    async up(sql) {
        await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP`;
        await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS review_invite_sent_at TIMESTAMP`;
        // Orders already received before this migration count as received when they were last updated.
        await sql`UPDATE orders SET delivered_at = updated_at WHERE status = 'DELIVERED' AND delivered_at IS NULL`;

        await sql`
            CREATE TABLE IF NOT EXISTS product_reviews (
                id SERIAL PRIMARY KEY,
                product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                -- The purchase that makes this a verified review.
                order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                -- Shown publicly: first name and last initial, never an email or phone.
                author_name TEXT NOT NULL,
                -- What was bought, e.g. "Brown" or "M / Navy".
                variant_label TEXT,
                rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
                title TEXT,
                body TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
                reject_reason TEXT,
                moderated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                moderated_at TIMESTAMP,
                reply_body TEXT,
                replied_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                replied_at TIMESTAMP,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (order_id, product_id)
            )
        `;
        await sql`CREATE INDEX IF NOT EXISTS idx_product_reviews_product_approved ON product_reviews(product_id, created_at DESC) WHERE status = 'APPROVED'`;
        await sql`CREATE INDEX IF NOT EXISTS idx_product_reviews_status ON product_reviews(status, created_at)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_orders_review_invite ON orders(delivered_at) WHERE review_invite_sent_at IS NULL`;
    },
};
