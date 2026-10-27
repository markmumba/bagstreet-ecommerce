import { sql } from "../../lib/db";
import type { Product, ProductImage, ProductListSort, ProductListView, ProductRequest, ProductViewCounts, StorefrontSort } from "shared/dist";

export interface AdminProductFilters {
    search: string;
    categoryId: number | null;
    view: ProductListView | null;
    sort: ProductListSort;
}

/** `%term%` for ILIKE, with the user's own % and _ matched literally; null when there's no search. */
function adminSearchPattern(search: string): string | null {
    const term = search.trim();
    return term ? `%${term.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%` : null;
}

type ProductImageRow = Omit<ProductImage, 'id' | 'product_id'> & {
    id: number;
    product_id: number;
};

export const productsQueries = {
    findAll: async (
        page: number,
        limit: number,
        categoryId: number | null,
        searchTerm: string,
        status: boolean | null,
        sort: StorefrontSort = 'name_asc'
    ): Promise<(Product & {
        total_stock: number | null;
        low_stock_variant_count: number;
        out_of_stock_variant_count: number;
    })[]> => {
        const offset = (page - 1) * limit;

        const pattern = searchTerm && searchTerm.trim() !== ""
            ? `%${searchTerm.trim()}%`
            : null;

        return await sql<(Product & {
            total_stock: number | null;
            low_stock_variant_count: number;
            out_of_stock_variant_count: number;
        })[]>`
            WITH RECURSIVE descendants AS (
                SELECT id FROM categories WHERE ${categoryId}::integer IS NOT NULL AND id = ${categoryId}::integer
                UNION ALL
                SELECT c.id FROM categories c JOIN descendants d ON c.parent_id = d.id
            )
            SELECT p.*,
                COALESCE(SUM(pv.stock) FILTER (WHERE pv.is_active = true), 0) AS total_stock,
                COUNT(*) FILTER (
                    WHERE pv.is_active = true
                      AND pv.stock > 0
                      AND pv.stock <= pv.low_stock_threshold
                ) AS low_stock_variant_count,
                COUNT(*) FILTER (
                    WHERE pv.is_active = true
                      AND pv.stock = 0
                ) AS out_of_stock_variant_count
            FROM products p
            LEFT JOIN product_variants pv ON pv.product_id = p.id
            WHERE (${categoryId}::integer IS NULL OR p.category_id IN (SELECT id FROM descendants))
              AND (${pattern}::text IS NULL OR p.name ILIKE ${pattern}::text)
              AND (${status}::boolean IS NULL OR p.is_active = ${status}::boolean)
            GROUP BY p.id
            ORDER BY
                CASE WHEN ${sort}::text = 'newest' THEN p.created_at END DESC,
                CASE WHEN ${sort}::text = 'price_asc' THEN
                    CASE WHEN p.sale_price IS NOT NULL AND (p.sale_ends_at IS NULL OR p.sale_ends_at > NOW())
                         THEN p.sale_price ELSE p.price END
                END ASC,
                CASE WHEN ${sort}::text = 'price_desc' THEN
                    CASE WHEN p.sale_price IS NOT NULL AND (p.sale_ends_at IS NULL OR p.sale_ends_at > NOW())
                         THEN p.sale_price ELSE p.price END
                END DESC,
                p.name ASC, p.id ASC
            LIMIT ${limit} OFFSET ${offset}
        `;
    },

    countAll: async (
        categoryId: number | null,
        searchTerm: string,
        status: boolean | null = null
    ): Promise<number> => {
        const pattern = searchTerm && searchTerm.trim() !== ""
            ? `%${searchTerm.trim()}%`
            : null;

        const [result] = await sql<[{ count: string }]>`
            WITH RECURSIVE descendants AS (
                SELECT id FROM categories WHERE ${categoryId}::integer IS NOT NULL AND id = ${categoryId}::integer
                UNION ALL
                SELECT c.id FROM categories c JOIN descendants d ON c.parent_id = d.id
            )
            SELECT COUNT(*) as count
            FROM products
            WHERE (${categoryId}::integer IS NULL OR category_id IN (SELECT id FROM descendants))
              AND (${pattern}::text IS NULL OR name ILIKE ${pattern}::text)
              AND (${status}::boolean IS NULL OR is_active = ${status}::boolean)
        `;
        return parseInt(result.count, 10);
    },

    /**
     * The admin products list: search (name or SKU), category, a saved view and an order that
     * applies across all pages. `total` is the number of matching products (for pagination).
     */
    listForAdmin: async (filters: AdminProductFilters, page: number, limit: number): Promise<{
        rows: (Product & { total_stock: number; low_stock_variant_count: number; out_of_stock_variant_count: number })[];
        total: number;
    }> => {
        const pattern = adminSearchPattern(filters.search);
        const rows = await sql<any[]>`
            WITH RECURSIVE descendants AS (
                SELECT id FROM categories WHERE ${filters.categoryId}::integer IS NOT NULL AND id = ${filters.categoryId}::integer
                UNION ALL
                SELECT c.id FROM categories c JOIN descendants d ON c.parent_id = d.id
            ),
            stocked AS (
                SELECT p.*,
                    COALESCE(SUM(pv.stock) FILTER (WHERE pv.is_active), 0) AS total_stock,
                    COUNT(pv.id) FILTER (WHERE pv.is_active AND pv.stock > 0 AND pv.stock <= pv.low_stock_threshold) AS low_stock_variant_count,
                    COUNT(pv.id) FILTER (WHERE pv.is_active AND pv.stock = 0) AS out_of_stock_variant_count,
                    (p.sale_price IS NOT NULL AND (p.sale_ends_at IS NULL OR p.sale_ends_at > NOW())) AS on_sale
                FROM products p
                LEFT JOIN product_variants pv ON pv.product_id = p.id
                WHERE (${filters.categoryId}::integer IS NULL OR p.category_id IN (SELECT id FROM descendants))
                  AND (${pattern}::text IS NULL OR p.name ILIKE ${pattern}::text OR p.sku ILIKE ${pattern}::text)
                GROUP BY p.id
            )
            SELECT *, COUNT(*) OVER () AS total_count
            FROM stocked
            WHERE CASE ${filters.view}::text
                WHEN 'restock' THEN low_stock_variant_count + out_of_stock_variant_count > 0
                WHEN 'sale' THEN on_sale
                WHEN 'featured' THEN is_featured
                WHEN 'hidden' THEN NOT is_active
                ELSE true
            END
            ORDER BY
                CASE WHEN ${filters.sort}::text = 'name_desc' THEN name END DESC,
                CASE WHEN ${filters.sort}::text = 'price_asc' THEN CASE WHEN on_sale THEN sale_price ELSE price END END ASC,
                CASE WHEN ${filters.sort}::text = 'price_desc' THEN CASE WHEN on_sale THEN sale_price ELSE price END END DESC,
                CASE WHEN ${filters.sort}::text = 'stock_asc' THEN total_stock END ASC,
                CASE WHEN ${filters.sort}::text = 'stock_desc' THEN total_stock END DESC,
                CASE WHEN ${filters.sort}::text = 'newest' THEN created_at END DESC,
                CASE WHEN ${filters.sort}::text = 'oldest' THEN created_at END ASC,
                name ASC, id ASC
            LIMIT ${limit} OFFSET ${(page - 1) * limit}
        `;
        return { rows, total: rows.length > 0 ? Number(rows[0].total_count) : 0 };
    },

    /** How many products each admin saved view holds, for a search and category. */
    adminViewCounts: async (filters: Pick<AdminProductFilters, 'search' | 'categoryId'>): Promise<ProductViewCounts> => {
        const pattern = adminSearchPattern(filters.search);
        const [row] = await sql<Record<keyof ProductViewCounts, string>[]>`
            WITH RECURSIVE descendants AS (
                SELECT id FROM categories WHERE ${filters.categoryId}::integer IS NOT NULL AND id = ${filters.categoryId}::integer
                UNION ALL
                SELECT c.id FROM categories c JOIN descendants d ON c.parent_id = d.id
            ),
            flagged AS (
                SELECT p.id, p.is_active, p.is_featured,
                    (p.sale_price IS NOT NULL AND (p.sale_ends_at IS NULL OR p.sale_ends_at > NOW())) AS on_sale,
                    EXISTS (
                        SELECT 1 FROM product_variants pv
                        WHERE pv.product_id = p.id AND pv.is_active AND pv.stock <= pv.low_stock_threshold
                    ) AS needs_restock
                FROM products p
                WHERE (${filters.categoryId}::integer IS NULL OR p.category_id IN (SELECT id FROM descendants))
                  AND (${pattern}::text IS NULL OR p.name ILIKE ${pattern}::text OR p.sku ILIKE ${pattern}::text)
            )
            SELECT
                COUNT(*) AS all,
                COUNT(*) FILTER (WHERE needs_restock) AS restock,
                COUNT(*) FILTER (WHERE on_sale) AS sale,
                COUNT(*) FILTER (WHERE is_featured) AS featured,
                COUNT(*) FILTER (WHERE NOT is_active) AS hidden
            FROM flagged
        `;
        return {
            all: Number(row?.all ?? 0),
            restock: Number(row?.restock ?? 0),
            sale: Number(row?.sale ?? 0),
            featured: Number(row?.featured ?? 0),
            hidden: Number(row?.hidden ?? 0),
        };
    },

    findFeatured: async (limit: number): Promise<(Product & {
        total_stock: number | null;
        low_stock_variant_count: number;
        out_of_stock_variant_count: number;
    })[]> => {
        return await sql<(Product & {
            total_stock: number | null;
            low_stock_variant_count: number;
            out_of_stock_variant_count: number;
        })[]>`
            SELECT p.*,
                COALESCE(SUM(pv.stock) FILTER (WHERE pv.is_active = true), 0) AS total_stock,
                COUNT(*) FILTER (
                    WHERE pv.is_active = true
                      AND pv.stock > 0
                      AND pv.stock <= pv.low_stock_threshold
                ) AS low_stock_variant_count,
                COUNT(*) FILTER (
                    WHERE pv.is_active = true
                      AND pv.stock = 0
                ) AS out_of_stock_variant_count
            FROM products p
            LEFT JOIN product_variants pv ON pv.product_id = p.id
            WHERE p.is_active = true
              AND p.is_featured = true
            GROUP BY p.id
            ORDER BY p.created_at DESC, p.name ASC
            LIMIT ${limit}
        `;
    },

    findById: async (id: number): Promise<Product | undefined> => {
        const [product] = await sql<Product[]>`SELECT * FROM products WHERE id = ${id} AND is_active=true`;
        return product;
    },

    findByIdAnyStatus: async (id: number): Promise<Product | undefined> => {
        const [product] = await sql<Product[]>`SELECT * FROM products WHERE id = ${id}`;
        return product;
    },

    findBySlug: async (slug: string): Promise<Product | undefined> => {
        const [product] = await sql<Product[]>`SELECT * FROM products WHERE slug = ${slug} AND is_active=true`;
        return product;
    },

    findBySlugAnyStatus: async (slug: string): Promise<Product | undefined> => {
        const [product] = await sql<Product[]>`SELECT * FROM products WHERE slug = ${slug}`;
        return product;
    },

    findImagesByProductId: async (productId: number): Promise<ProductImageRow[]> => {
        return await sql<ProductImageRow[]>`
            SELECT id, product_id, url, alt_text, position, is_primary, created_at
            FROM product_images
            WHERE product_id = ${productId}
            ORDER BY is_primary DESC, position ASC, id ASC
        `;
    },

    findImagesByProductIds: async (productIds: number[]): Promise<ProductImageRow[]> => {
        if (productIds.length === 0) return [];
        const safeProductIds = productIds.filter((id) => Number.isInteger(id) && id > 0);
        if (safeProductIds.length === 0) return [];

        return await sql<ProductImageRow[]>`
            SELECT id, product_id, url, alt_text, position, is_primary, created_at
            FROM product_images
            WHERE product_id IN ${sql(safeProductIds)}
            ORDER BY product_id ASC, is_primary DESC, position ASC, id ASC
        `;
    },

    replaceImages: async (productId: number, images: { url: string; alt_text?: string | null; position: number; is_primary: boolean }[]): Promise<void> => {
        await sql.begin(async (tx: typeof sql) => {
            await tx`DELETE FROM product_images WHERE product_id = ${productId}`;
            for (const image of images) {
                await tx`
                    INSERT INTO product_images(product_id, url, alt_text, position, is_primary)
                    VALUES (${productId}, ${image.url}, ${image.alt_text ?? null}, ${image.position}, ${image.is_primary})
                `;
            }
            await tx`
                UPDATE products
                SET image_url = ${images[0]?.url ?? null}
                WHERE id = ${productId}
            `;
        });
    },

    create: async (product: ProductRequest & { sku: string; slug: string }): Promise<Product | undefined> => {
        const result = await sql<Product[]>`INSERT INTO products
         (category_id, name, description, sku, slug, price, stock, image_url, is_active)
        VALUES
        (${product.category_id}, ${product.name}, ${product.description ?? null}, ${product.sku}, ${product.slug}, ${product.price}, ${product.stock ?? 0}, ${product.image_url ?? null}, ${product.is_active}) RETURNING *`;
        const [newProduct] = result;
        return newProduct;
    },

    update: async (id: number, product: { name?: string; description?: string; price?: number; image_url?: string; is_active?: boolean; is_featured?: boolean; sale_price?: number | null; sale_ends_at?: string | null }): Promise<Product | undefined> => {
        const [updatedProduct] = await sql<Product[]>`UPDATE products SET ${sql(product)} WHERE id = ${id} RETURNING *`;
        return updatedProduct;
    },

    setSale: async (id: number, data: { sale_price: number | null; sale_ends_at?: string | null }): Promise<Product | undefined> => {
        const [updatedProduct] = await sql<Product[]>`
            UPDATE products
            SET sale_price = ${data.sale_price}, sale_ends_at = ${data.sale_price == null ? null : data.sale_ends_at ?? null}
            WHERE id = ${id}
            RETURNING *
        `;
        return updatedProduct;
    },

    findOnSale: async (): Promise<Product[]> => {
        return await sql<Product[]>`
            SELECT * FROM products
            WHERE is_active = true
              AND sale_price IS NOT NULL
              AND (sale_ends_at IS NULL OR sale_ends_at > NOW())
            ORDER BY sale_ends_at ASC NULLS LAST, name ASC
        `;
    },

    deactivate: async(id:number): Promise<void> => {
        await sql`UPDATE products SET is_active=false WHERE id=${id}`;
    },
    delete: async (id: number): Promise<void> => {
        await sql`DELETE FROM products WHERE id = ${id}`;
    },

};
