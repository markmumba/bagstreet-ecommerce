import type { CategoryTreeNode } from './category';
import type { ProductResponse } from './product';

export interface StorefrontHomeResponse {
    featured_products: ProductResponse[];
    products: ProductResponse[];
    category_tree: CategoryTreeNode[];
}
