import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { ShoppingBag, ArrowLeft } from 'lucide-react';
import { useProduct, useProductVariants } from '@/hooks/useProducts';
import { useAddToCart } from '@/hooks/useCart';
import { useAuth } from '@/context/AuthContext';
import type { ProductVariantResponse } from 'shared';

export const Route = createFileRoute('/products/$productId')({
  component: ProductDetailPage,
});

function formatPrice(price: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(price);
}

function ProductDetailPage() {
  const { productId } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  const { data: productRes, isLoading } = useProduct(productId);
  const { data: variantsRes } = useProductVariants(productId);
  const addToCart = useAddToCart();

  const product = productRes?.data;
  const variants = (variantsRes?.data as ProductVariantResponse[]) ?? [];
  const activeVariants = variants.filter((v) => v.is_active);

  // Distinct colors and sizes across ALL active variants
  const allColors = [...new Set(activeVariants.map((v) => v.color).filter(Boolean))] as string[];
  const allSizes  = [...new Set(activeVariants.map((v) => v.size).filter(Boolean))]  as string[];

  // Whether these dimensions actually differentiate variants
  const hasColors = allColors.length > 0;
  const hasSizes  = allSizes.length > 1; // only show size selector when >1 distinct size

  // Sizes available for the currently selected color (or all if no color selected)
  const sizesForColor = selectedColor
    ? [...new Set(activeVariants.filter((v) => v.color === selectedColor).map((v) => v.size).filter(Boolean))] as string[]
    : allSizes;

  // Colors available for the currently selected size (or all if no size selected)
  const colorsForSize = selectedSize
    ? [...new Set(activeVariants.filter((v) => v.size === selectedSize).map((v) => v.color).filter(Boolean))] as string[]
    : allColors;

  // Derive the matched variant from selections
  const selectedVariant: ProductVariantResponse | null = (() => {
    if (activeVariants.length === 0) return null;
    // Must have all required selections made
    if (hasColors && !selectedColor) return null;
    if (hasSizes && !selectedSize) return null;

    return (
      activeVariants.find((v) => {
        const colorMatch = !selectedColor || v.color === selectedColor;
        const sizeMatch  = !selectedSize  || v.size  === selectedSize;
        return colorMatch && sizeMatch && v.stock > 0;
      }) ??
      activeVariants.find((v) => {
        const colorMatch = !selectedColor || v.color === selectedColor;
        const sizeMatch  = !selectedSize  || v.size  === selectedSize;
        return colorMatch && sizeMatch;
      }) ??
      null
    );
  })();

  // Auto-select when only one option in a dimension
  useEffect(() => {
    if (allColors.length === 1) setSelectedColor(allColors[0]);
    if (allSizes.length === 1)  setSelectedSize(allSizes[0]);
  }, [variantsRes]);

  // If color changes and current size is no longer available for it, clear size
  useEffect(() => {
    if (selectedSize && selectedColor) {
      const available = activeVariants
        .filter((v) => v.color === selectedColor)
        .map((v) => v.size);
      if (!available.includes(selectedSize)) setSelectedSize(null);
    }
  }, [selectedColor]);

  const effectivePrice = selectedVariant?.price_override ?? product?.price ?? 0;

  const handleAddToCart = async () => {
    if (!user) { navigate({ to: '/login' }); return; }
    if (!selectedVariant) return;
    await addToCart.mutateAsync({ variant_id: Number(selectedVariant.id), quantity });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const needsSelection = (hasColors && !selectedColor) || (hasSizes && !selectedSize);

  if (isLoading) {
    return (
      <div className="max-w-[1440px] mx-auto px-8 sm:px-12 lg:px-20 pt-[72px]">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-16 animate-pulse py-16">
          <div className="md:col-span-7 aspect-[3/4] bg-[var(--surface)]" />
          <div className="md:col-span-5 space-y-4 pt-8">
            <div className="h-8 bg-[var(--surface)] w-3/4" />
            <div className="h-6 bg-[var(--surface)] w-1/4" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) return (
    <div
      className="text-center py-32 text-[var(--foreground-faint)] text-xs tracking-[0.2em] uppercase"
      style={{ fontFamily: 'var(--font-sans)' }}
    >
      Product not found.
    </div>
  );

  return (
    <div className="max-w-[1440px] mx-auto px-8 sm:px-12 lg:px-20 pt-[72px]">
      {/* Back */}
      <button
        onClick={() => navigate({ to: '/' })}
        className="flex items-center gap-2 mt-8 mb-12 text-xs tracking-[0.15em] uppercase text-[var(--foreground-faint)] hover:text-foreground transition-colors duration-200"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        <ArrowLeft strokeWidth={1} className="h-4 w-4" />
        Back
      </button>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-16 pb-24">
        {/* Image */}
        <div className="md:col-span-7 aspect-[3/4] overflow-hidden bg-[var(--surface)]">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[var(--foreground-faint)] text-xs tracking-[0.15em] uppercase">
              No image
            </div>
          )}
        </div>

        {/* Info */}
        <div className="md:col-span-5 flex flex-col gap-8 pt-2">
          <div>
            <h1
              className="text-3xl font-normal text-foreground leading-snug"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {product.name}
            </h1>
            <p
              className="text-lg font-light text-[var(--foreground-muted)] mt-3"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {formatPrice(effectivePrice)}
            </p>
          </div>

          {product.description && (
            <p
              className="text-sm font-light text-[var(--foreground-muted)] leading-relaxed"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              {product.description}
            </p>
          )}

          {/* Variant selectors */}
          {activeVariants.length > 0 && (
            <div className="space-y-6">

              {/* COLOR — shown whenever colors exist */}
              {hasColors && (
                <div>
                  <p
                    className="text-xs tracking-[0.18em] uppercase text-[var(--foreground-faint)] mb-3"
                    style={{ fontFamily: 'var(--font-sans)' }}
                  >
                    Colour
                    {selectedColor && (
                      <span className="ml-2 normal-case tracking-normal text-foreground">
                        — {selectedColor}
                      </span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {allColors.map((color) => {
                      const available = activeVariants.some(
                        (v) => v.color === color && (!selectedSize || v.size === selectedSize) && v.stock > 0
                      );
                      const inCurrentFilter = !selectedSize || colorsForSize.includes(color);
                      const isSelected = selectedColor === color;
                      return (
                        <button
                          key={color}
                          onClick={() => setSelectedColor(isSelected ? null : color)}
                          title={color}
                          className={`px-4 h-10 text-xs tracking-wide border transition-colors duration-200
                            ${isSelected
                              ? 'border-foreground bg-foreground text-background'
                              : available && inCurrentFilter
                                ? 'border-[var(--border)] text-foreground hover:border-foreground'
                                : 'border-[var(--border)] text-[var(--foreground-faint)] opacity-40 cursor-not-allowed'
                            }`}
                          style={{ fontFamily: 'var(--font-sans)' }}
                          disabled={!available || !inCurrentFilter}
                        >
                          {color}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SIZE — only shown when >1 distinct size */}
              {hasSizes && (
                <div>
                  <p
                    className="text-xs tracking-[0.18em] uppercase text-[var(--foreground-faint)] mb-3"
                    style={{ fontFamily: 'var(--font-sans)' }}
                  >
                    Size
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {allSizes.map((size) => {
                      const available = activeVariants.some(
                        (v) => v.size === size && (!selectedColor || v.color === selectedColor) && v.stock > 0
                      );
                      const inCurrentFilter = !selectedColor || sizesForColor.includes(size);
                      const isSelected = selectedSize === size;
                      return (
                        <button
                          key={size}
                          onClick={() => setSelectedSize(isSelected ? null : size)}
                          disabled={!available || !inCurrentFilter}
                          className={`w-12 h-12 text-xs tracking-wide border transition-colors duration-200
                            ${isSelected
                              ? 'border-foreground bg-foreground text-background'
                              : available && inCurrentFilter
                                ? 'border-[var(--border)] text-foreground hover:border-foreground'
                                : 'border-[var(--border)] text-[var(--foreground-faint)] opacity-40 cursor-not-allowed line-through'
                            }`}
                          style={{ fontFamily: 'var(--font-sans)' }}
                        >
                          {size}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Stock hint */}
              {selectedVariant && (
                <p
                  className="text-xs text-[var(--foreground-faint)] tracking-wide"
                  style={{ fontFamily: 'var(--font-sans)' }}
                >
                  {selectedVariant.stock === 0
                    ? 'Out of stock'
                    : selectedVariant.stock <= 3
                      ? `Only ${selectedVariant.stock} left`
                      : 'In stock'}
                </p>
              )}
            </div>
          )}

          {/* Quantity + Add to bag */}
          <div className="space-y-4">
            <div className="flex items-center border-b border-[var(--border)] w-fit">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="px-3 py-2 text-sm text-[var(--foreground-muted)] hover:text-foreground transition-colors"
              >−</button>
              <span
                className="px-4 py-2 text-sm font-light min-w-[2.5rem] text-center text-foreground"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {quantity}
              </span>
              <button
                onClick={() => setQuantity((q) => Math.min(selectedVariant?.stock ?? 1, q + 1))}
                className="px-3 py-2 text-sm text-[var(--foreground-muted)] hover:text-foreground transition-colors"
              >+</button>
            </div>

            <button
              onClick={handleAddToCart}
              disabled={!selectedVariant || selectedVariant.stock === 0 || addToCart.isPending}
              className="w-full h-12 flex items-center justify-center gap-2
                         bg-foreground text-background
                         text-xs tracking-[0.18em] uppercase font-normal
                         hover:bg-primary transition-colors duration-300
                         disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              <ShoppingBag strokeWidth={1} className="h-4 w-4" />
              {added ? 'Added to Bag' : addToCart.isPending ? 'Adding...' : 'Add to Bag'}
            </button>

            {needsSelection && (
              <p
                className="text-xs tracking-[0.12em] uppercase text-[var(--foreground-faint)]"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                {hasColors && !selectedColor ? 'Please select a colour' : 'Please select a size'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
