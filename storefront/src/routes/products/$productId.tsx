import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect, useMemo } from 'react';
import { ShoppingBag, ArrowLeft } from 'lucide-react';
import { useProduct, useProductVariants } from '@/hooks/useProducts';
import { useAddToCart } from '@/hooks/useCart';
import { useSeo } from '@/hooks/useSeo';
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

  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  const { data: productRes, isLoading } = useProduct(productId);
  const addToCart = useAddToCart();

  const product = productRes?.data;
  const productInternalId = product?.id;
  const { data: variantsRes } = useProductVariants(productInternalId);
  const variants = (variantsRes?.data as ProductVariantResponse[]) ?? [];
  const activeVariants = useMemo(() => variants.filter((v) => v.is_active), [variants]);
  const galleryImages = useMemo(() => {
    if (!product) return [];
    const images = product.images?.length
      ? product.images.map((image) => ({ url: image.url, alt: image.alt_text || product.name }))
      : product.image_url ? [{ url: product.image_url, alt: product.name }] : [];
    return images;
  }, [product]);
  const selectedImage = galleryImages[selectedImageIndex] ?? galleryImages[0];

  useSeo({
    title: product ? product.name : 'Product',
    description: product?.description || 'Shop this Bagstreet product with secure checkout.',
    image: product?.image_url || undefined,
    canonicalPath: `/products/${product?.slug ?? productId}`,
  });

  useEffect(() => {
    setSelectedImageIndex(0);
  }, [productId, galleryImages.length]);

  // Distinct colors and sizes across ALL active variants
  const allColors = useMemo(
    () => [...new Set(activeVariants.map((v) => v.color).filter(Boolean))] as string[],
    [activeVariants]
  );
  const allSizes = useMemo(
    () => [...new Set(activeVariants.map((v) => v.size).filter(Boolean))] as string[],
    [activeVariants]
  );

  // Whether these dimensions actually differentiate variants
  const hasColors = allColors.length > 0;
  const hasSizes  = allSizes.length > 1; // only show size selector when >1 distinct size

  // Sizes available for the currently selected color (or all if no color selected)
  const sizesForColor = useMemo(
    () => selectedColor
      ? [...new Set(activeVariants.filter((v) => v.color === selectedColor).map((v) => v.size).filter(Boolean))] as string[]
      : allSizes,
    [activeVariants, allSizes, selectedColor]
  );

  // Colors available for the currently selected size (or all if no size selected)
  const colorsForSize = useMemo(
    () => selectedSize
      ? [...new Set(activeVariants.filter((v) => v.size === selectedSize).map((v) => v.color).filter(Boolean))] as string[]
      : allColors,
    [activeVariants, allColors, selectedSize]
  );

  // Derive the matched variant from selections
  const selectedVariant: ProductVariantResponse | null = useMemo(() => {
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
  }, [activeVariants, hasColors, hasSizes, selectedColor, selectedSize]);

  // Auto-select when only one option in a dimension
  useEffect(() => {
    if (allColors.length === 1) setSelectedColor(allColors[0]);
    if (allSizes.length === 1)  setSelectedSize(allSizes[0]);
  }, [allColors, allSizes]);

  // If color changes and current size is no longer available for it, clear size
  useEffect(() => {
    if (selectedSize && selectedColor) {
      const available = activeVariants
        .filter((v) => v.color === selectedColor)
        .map((v) => v.size);
      if (!available.includes(selectedSize)) setSelectedSize(null);
    }
  }, [activeVariants, selectedColor, selectedSize]);

  const saleIsActive = product?.sale_price != null
    && (!product.sale_ends_at || new Date(product.sale_ends_at).getTime() > Date.now());
  const effectivePrice = selectedVariant?.price_override ?? (saleIsActive ? product?.sale_price : product?.price) ?? 0;

  const handleAddToCart = async () => {
    if (!selectedVariant || !product) return;
    await addToCart.mutateAsync({
      variant_id: Number(selectedVariant.id),
      product_id: product.id,
      product_name: product.name,
      product_image_url: product.image_url,
      variant_sku: selectedVariant.sku,
      variant_size: selectedVariant.size,
      variant_color: selectedVariant.color,
      unit_price: effectivePrice,
      quantity,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const needsSelection = (hasColors && !selectedColor) || (hasSizes && !selectedSize);

  if (isLoading) {
    return (
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-20 pt-[72px]">
        <div className="grid grid-cols-1 gap-10 py-16 animate-pulse md:grid-cols-[minmax(0,520px)_minmax(320px,480px)] md:justify-center md:gap-14 lg:grid-cols-[minmax(0,560px)_minmax(360px,520px)]">
          <div className="aspect-[4/5] bg-[var(--surface)]" />
          <div className="space-y-4 pt-4">
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
    <div className="max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-20 pt-[72px]">
      {/* Back */}
      <button
        onClick={() => navigate({ to: '/' })}
        className="flex items-center gap-2 mt-6 mb-8 text-xs tracking-[0.15em] uppercase text-[var(--foreground-faint)] hover:text-foreground transition-colors duration-200 sm:mt-8 sm:mb-12"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        <ArrowLeft strokeWidth={1} className="h-4 w-4" />
        Back
      </button>

      <div className="grid grid-cols-1 gap-10 pb-20 md:grid-cols-[minmax(0,520px)_minmax(320px,480px)] md:items-start md:justify-center md:gap-14 lg:grid-cols-[minmax(0,560px)_minmax(360px,520px)] lg:gap-20">
        {/* Image gallery */}
        <div className="space-y-3">
          <div className="aspect-[4/5] overflow-hidden bg-[var(--surface)]">
            {selectedImage ? (
              <img
                src={selectedImage.url}
                alt={selectedImage.alt}
                loading="eager"
                decoding="async"
                sizes="(min-width: 1024px) 560px, (min-width: 768px) 520px, 100vw"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[var(--foreground-faint)] text-xs tracking-[0.15em] uppercase">
                No image
              </div>
            )}
          </div>

          {galleryImages.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Product images">
              {galleryImages.map((image, index) => (
                <button
                  key={`${image.url}-${index}`}
                  type="button"
                  onClick={() => setSelectedImageIndex(index)}
                  className={`h-16 w-14 shrink-0 overflow-hidden border transition-colors duration-200 sm:h-20 sm:w-16 ${
                    selectedImageIndex === index
                      ? 'border-foreground'
                      : 'border-[var(--border)] hover:border-[var(--foreground-muted)]'
                  }`}
                  aria-label={`View product image ${index + 1}`}
                  aria-pressed={selectedImageIndex === index}
                >
                  <img
                    src={image.url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex flex-col gap-8 pt-2 md:pt-4 lg:pt-6">
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
              {saleIsActive && selectedVariant?.price_override == null ? (
                <>
                  <span className="text-foreground">{formatPrice(effectivePrice)}</span>
                  <span className="ml-3 text-sm text-[var(--foreground-faint)] line-through">{formatPrice(product.price)}</span>
                  <span className="ml-3 align-middle text-[10px] uppercase tracking-[0.18em] text-foreground">Sale</span>
                </>
              ) : (
                formatPrice(effectivePrice)
              )}
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
