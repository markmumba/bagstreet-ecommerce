import type { CategoryResponse, CategoryTreeNode } from './category';
import type { ProductResponse } from './product';

export interface StorefrontHomeResponse {
    featured_products: ProductResponse[];
    products: ProductResponse[];
    category_tree: CategoryTreeNode[];
}

export const STOREFRONT_SORTS = ['newest', 'price_asc', 'price_desc', 'name_asc'] as const;
export type StorefrontSort = typeof STOREFRONT_SORTS[number];

export interface StorefrontCatalogResponse {
    products: ProductResponse[];
    category_tree: CategoryTreeNode[];
    category: CategoryResponse | null;
    pagination: {
        page: number;
        limit: number;
        total: number;
        total_pages: number;
    };
}

/** Homepage hero campaign, managed by the shop owner from the admin settings page. */
export interface StorefrontHero {
    /** 2400px-wide banner, or null to show the storefront's placeholder. */
    image_url: string | null;
    /** 1080px-wide version for phones. */
    image_url_small: string | null;
    eyebrow: string;
    /** Use a line break to split the headline; the last line is set in italics. */
    title: string;
    subtitle: string;
}

/** One line the storefront asks to price. The guest cart lives in localStorage, so this is all the server gets. */
export interface CartQuoteRequestItem {
    variant_id: number;
    quantity: number;
}

/**
 * - `ok`: can be bought at the requested quantity
 * - `insufficient_stock`: fewer in stock than requested (`purchasable_quantity` says how many)
 * - `out_of_stock`: none left
 * - `unavailable`: variant or product was removed or deactivated
 */
export type CartQuoteLineStatus = 'ok' | 'insufficient_stock' | 'out_of_stock' | 'unavailable';

export interface CartQuoteLine {
    variant_id: number;
    status: CartQuoteLineStatus;
    requested_quantity: number;
    purchasable_quantity: number;
    /** Current price per unit — the same value order creation will charge. Null when unavailable. */
    unit_price: number | null;
    /** List price to strike through when on sale; null otherwise. */
    compare_at_price: number | null;
    line_total: number;
    stock: number;
    product_id: string | null;
    product_slug: string | null;
    product_name: string | null;
    image_url: string | null;
    size: string | null;
    color: string | null;
}

export interface CartQuoteResponse {
    lines: CartQuoteLine[];
    /** Sum of line totals at purchasable quantities. */
    subtotal: number;
    item_count: number;
    free_delivery_threshold: number;
    amount_to_free_delivery: number;
    /** True only when every line is `ok`. */
    can_checkout: boolean;
}

export interface RecoveryPreferencesResponse {
    enabled: boolean;
    recovery_opt_in: boolean;
}

export interface CartRecoveryResponse {
    state: 'ready' | 'payment_pending' | 'completed';
    expires_at: string;
    quote: CartQuoteResponse | null;
}
