/**
 * Single source of truth for what a customer pays for a variant.
 * Used by order creation AND the storefront cart quote, so the cart can never
 * show a price the order won't charge.
 */

type Money = string | number;

export interface PricingProduct {
    price: Money;
    sale_price: Money | null;
    sale_ends_at: string | Date | null;
}

export interface PricingVariant {
    price_override: Money | null;
}

const toNumber = (value: Money) => (typeof value === 'number' ? value : parseFloat(value));

/** Rounds to cents to avoid float drift when multiplying prices by quantities. */
export const roundMoney = (value: number) => Math.round(value * 100) / 100;

export function saleIsActive(product: PricingProduct, now: number = Date.now()) {
    return product.sale_price != null
        && (!product.sale_ends_at || new Date(product.sale_ends_at).getTime() > now);
}

/** Variant override wins, then an active sale, then the list price. */
export function resolveUnitPrice(product: PricingProduct, variant: PricingVariant, now: number = Date.now()) {
    if (variant.price_override != null) return toNumber(variant.price_override);
    if (saleIsActive(product, now)) return toNumber(product.sale_price!);
    return toNumber(product.price);
}

/** The "was" price to strike through, or null when the customer pays the list price. */
export function resolveCompareAtPrice(product: PricingProduct, variant: PricingVariant, now: number = Date.now()) {
    const listPrice = toNumber(product.price);
    const unitPrice = resolveUnitPrice(product, variant, now);
    return unitPrice < listPrice ? listPrice : null;
}
