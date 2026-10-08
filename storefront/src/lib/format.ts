import type { CategoryTreeNode, ProductResponse } from 'shared';

const priceFormatter = new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' });

export function formatPrice(price: number) {
  return priceFormatter.format(price);
}

export function isSaleActive(product: ProductResponse) {
  return product.sale_price != null
    && (!product.sale_ends_at || new Date(product.sale_ends_at).getTime() > Date.now());
}

/** Ids of a category and all of its descendants. */
export function categoryIds(node: CategoryTreeNode): string[] {
  return [node.id, ...node.children.flatMap(categoryIds)];
}

/** First product image that belongs to a category (or its children) — used for menu and tile imagery. */
export function categoryImage(node: CategoryTreeNode, products: ProductResponse[]) {
  const ids = new Set(categoryIds(node));
  return products.find((p) => ids.has(String(p.category_id)) && p.image_url)?.image_url;
}
