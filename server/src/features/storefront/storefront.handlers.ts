import type { AppContext } from '@server/lib/hono';
import { success } from '@server/lib/response';
import { categoriesQueries } from '../categories/categories.queries';
import { productsQueries } from '../products/products.queries';
import type { CategoryTreeNode, CategoryResponse, ProductImage, ProductResponse, StorefrontHomeResponse } from 'shared/dist';

function toProductResponse(product: any): ProductResponse {
    const images = (product.images ?? []).map((image: ProductImage) => ({
        id: image.id.toString(),
        product_id: image.product_id.toString(),
        url: image.url,
        alt_text: image.alt_text ?? undefined,
        position: Number(image.position),
        is_primary: Boolean(image.is_primary),
        created_at: image.created_at,
    }));

    return {
        id: product.id.toString(),
        category_id: product.category_id,
        name: product.name,
        sku: product.sku,
        slug: product.slug ?? '',
        description: product.description ?? '',
        price: parseFloat(product.price),
        sale_price: product.sale_price != null ? parseFloat(product.sale_price) : undefined,
        sale_ends_at: product.sale_ends_at ?? undefined,
        stock: product.stock,
        total_stock: product.total_stock != null ? parseInt(product.total_stock, 10) : undefined,
        low_stock_variant_count: product.low_stock_variant_count != null ? Number(product.low_stock_variant_count) : undefined,
        out_of_stock_variant_count: product.out_of_stock_variant_count != null ? Number(product.out_of_stock_variant_count) : undefined,
        stock_status:
            Number(product.out_of_stock_variant_count ?? 0) > 0
                ? 'out'
                : Number(product.low_stock_variant_count ?? 0) > 0
                    ? 'low'
                    : 'high',
        image_url: product.image_url ?? images[0]?.url ?? '',
        images,
        is_active: product.is_active,
        is_featured: product.is_featured ?? false,
        created_at: product.created_at,
        updated_at: product.updated_at,
    };
}

function toCategoryResponse(category: any): CategoryResponse {
    return {
        id: category.id.toString(),
        name: category.name,
        description: category.description ?? '',
        parent_id: category.parent_id != null ? category.parent_id.toString() : null,
        parent_name: category.parent_name ?? undefined,
        children_count: category.children_count ?? 0,
        created_at: category.created_at,
        updated_at: category.updated_at,
    };
}

function toCategoryTree(categories: any[]): CategoryTreeNode[] {
    const map = new Map<number, CategoryTreeNode>(
        categories.map((category) => [Number(category.id), { ...toCategoryResponse(category), children: [] }])
    );
    const roots: CategoryTreeNode[] = [];

    for (const node of map.values()) {
        if (node.parent_id == null) {
            roots.push(node);
            continue;
        }

        const parent = map.get(Number(node.parent_id));
        if (parent) parent.children.push(node);
    }

    return roots;
}

async function attachImages(products: any[]) {
    const productIds = [...new Set(products.map((product) => Number(product.id)).filter(Boolean))];
    const images = await productsQueries.findImagesByProductIds(productIds);
    const imagesByProductId = new Map<number, typeof images>();

    for (const image of images) {
        const existing = imagesByProductId.get(image.product_id) ?? [];
        existing.push(image);
        imagesByProductId.set(image.product_id, existing);
    }

    return products.map((product) => ({
        ...product,
        images: imagesByProductId.get(Number(product.id)) ?? [],
    }));
}

export const storefrontHandlers = {
    home: async (c: AppContext) => {
        const rawSearch = c.req.query('search') ?? '';
        const search = rawSearch.trim();
        const categoryParam = c.req.query('categoryId');
        const categoryId = categoryParam ? parseInt(categoryParam, 10) : null;
        const limit = Math.min(48, Math.max(1, parseInt(c.req.query('limit') ?? '48', 10)));
        const shouldShowFeatured = search.length === 0;

        const categoriesPromise = categoriesQueries.findAllFlat();
        const productsPromise = productsQueries.findAll(1, limit, categoryId, search, true);
        const featuredPromise = shouldShowFeatured
            ? productsQueries.findFeatured(8)
            : Promise.resolve([]);

        const [categories, products, featuredProducts] = await Promise.all([
            categoriesPromise,
            productsPromise,
            featuredPromise,
        ]);

        const productsWithImages = await attachImages([...featuredProducts, ...products]);
        const responseByProductId = new Map(
            productsWithImages.map((product) => [Number(product.id), toProductResponse(product)])
        );

        const response: StorefrontHomeResponse = {
            featured_products: shouldShowFeatured
                ? featuredProducts.map((product) => responseByProductId.get(Number(product.id))!).filter(Boolean)
                : [],
            products: products.map((product) => responseByProductId.get(Number(product.id))!).filter(Boolean),
            category_tree: toCategoryTree(categories),
        };

        return success(c, response);
    },
};
