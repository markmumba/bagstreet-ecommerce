import { createFileRoute, Link } from '@tanstack/react-router';
import { useState, useEffect, useMemo, useRef } from 'react';
import { Check, Lock, Truck } from 'lucide-react';
import { useProduct, useProductVariants } from '@/hooks/useProducts';
import { useAddToCart } from '@/hooks/useCart';
import { useSeo } from '@/hooks/useSeo';
import { useStorefrontHome } from '@/hooks/useStorefrontHome';
import { ProductRail } from '@/components/home/ProductRail';
import { formatPrice, isSaleActive } from '@/lib/format';
import type { CategoryTreeNode, ProductResponse, ProductVariantResponse } from 'shared';

export const Route = createFileRoute('/products/$productId')({
  component: ProductDetailPage,
});

/** Locates a category and its parent in the tree for the breadcrumb. */
function findCategoryPath(tree: CategoryTreeNode[], id: string | undefined) {
  if (!id) return [];
  for (const parent of tree) {
    if (parent.id === id) return [parent];
    const child = parent.children.find((c) => c.id === id);
    if (child) return [parent, child];
  }
  return [];
}

function ProductDetailPage() {
  const { productId } = Route.useParams();
  const galleryRef = useRef<HTMLDivElement>(null);

  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [showSelectionPrompt, setShowSelectionPrompt] = useState(false);

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

  // Category tree is already cached by the navbar; related pieces come from the same category.
  const treeQuery = useStorefrontHome({ limit: 48 });
  const tree = (treeQuery.data?.data?.category_tree as CategoryTreeNode[]) ?? [];
  const categoryPath = findCategoryPath(tree, product ? String(product.category_id) : undefined);
  const relatedQuery = useStorefrontHome({ categoryId: product ? String(product.category_id) : undefined, limit: 9 });
  const relatedProducts = ((relatedQuery.data?.data?.products as ProductResponse[]) ?? [])
    .filter((p) => p.id !== product?.id)
    .slice(0, 8);

  useSeo({
    title: product ? product.name : 'Product',
    description: product?.description || 'Shop this Bagstreet product with secure checkout.',
    image: product?.image_url || undefined,
    canonicalPath: `/products/${product?.slug ?? productId}`,
  });

  useEffect(() => {
    setSelectedImageIndex(0);
    galleryRef.current?.scrollTo({ left: 0 });
  }, [productId, galleryImages.length]);

  // Mobile gallery: track which slide is in view for the counter.
  const onGalleryScroll = () => {
    const el = galleryRef.current;
    if (!el) return;
    setSelectedImageIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  const scrollToImage = (index: number) => {
    const el = galleryRef.current;
    if (el) el.scrollTo({
      left: index * el.clientWidth,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  };

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

  const saleIsActive = product ? isSaleActive(product) : false;
  const effectivePrice = selectedVariant?.price_override ?? (saleIsActive ? product?.sale_price : product?.price) ?? 0;

  const needsSelection = (hasColors && !selectedColor) || (hasSizes && !selectedSize);
  const soldOut = activeVariants.length > 0 && activeVariants.every((v) => v.stock === 0);

  useEffect(() => {
    if (!needsSelection) setShowSelectionPrompt(false);
  }, [needsSelection]);

  const handleAddToCart = async () => {
    if (needsSelection) {
      setShowSelectionPrompt(true);
      return;
    }
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
    setTimeout(() => setAdded(false), 4000);
  };

  const selectionPrompt = hasColors && !selectedColor ? 'Please select a colour' : 'Please select a size';
  const buttonLabel = soldOut || selectedVariant?.stock === 0
    ? 'Sold out'
    : addToCart.isPending ? 'Adding…' : 'Add to bag';

  if (isLoading) {
    return (
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-20 pt-[104px] pb-20">
        <div className="grid gap-10 animate-pulse lg:grid-cols-12 lg:gap-8">
          <div className="aspect-[4/5] bg-surface lg:col-span-7" />
          <div className="space-y-4 lg:col-span-4 lg:col-start-9">
            <div className="h-3 w-1/4 bg-surface" />
            <div className="h-10 w-3/4 bg-surface" />
            <div className="h-5 w-1/3 bg-surface" />
            <div className="mt-10 h-[52px] bg-surface" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) return (
    <div className="flex min-h-[70svh] flex-col items-center justify-center gap-6 px-4 pt-[72px] text-center">
      <p className="text-label-caps text-foreground-faint">Not found</p>
      <h1 className="text-headline-lg">This piece has <em>moved on</em></h1>
      <Link
        to="/shop"
        className="text-label-caps underline decoration-[0.5px] underline-offset-[6px] hover:text-brass-text"
      >
        Browse the collection
      </Link>
    </div>
  );

  const hasVariantPrice = selectedVariant?.price_override != null;

  return (
    <>
    <div className="max-w-[1440px] mx-auto px-0 sm:px-8 lg:px-20 pt-[72px]">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="px-4 py-5 sm:px-0 sm:py-7">
        <ol className="flex flex-wrap items-center gap-2 text-label-caps text-foreground-faint">
          <li><Link to="/shop" className="hover:text-foreground transition-colors">Shop</Link></li>
          {categoryPath.map((node) => (
            <li key={node.id} className="flex items-center gap-2">
              <span aria-hidden="true">/</span>
              <Link to="/shop/$categorySlug" params={{ categorySlug: node.slug }} className="hover:text-foreground transition-colors">
                {node.name}
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      <div className="grid gap-8 pb-20 lg:grid-cols-12 lg:gap-8">
        {/* Gallery — swipeable on mobile, stacked lookbook on desktop */}
        <div className="lg:col-span-7">
          {galleryImages.length === 0 ? (
            <div className="flex aspect-[4/5] items-center justify-center bg-surface text-label-caps text-foreground-faint">
              Image coming soon
            </div>
          ) : (
            <>
              <div
                ref={galleryRef}
                onScroll={onGalleryScroll}
                aria-label="Product images"
                className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
                           lg:grid lg:snap-none lg:grid-cols-2 lg:gap-2 lg:overflow-visible"
              >
                {galleryImages.map((image, index) => (
                  <div
                    key={`${image.url}-${index}`}
                    className={`aspect-[4/5] w-full shrink-0 snap-center overflow-hidden bg-surface ${
                      // Lead image spans the full width; the rest pair up beneath it.
                      index === 0 || (index === galleryImages.length - 1 && galleryImages.length % 2 === 0)
                        ? 'lg:col-span-2'
                        : ''
                    }`}
                  >
                    <img
                      src={image.url}
                      alt={index === 0 ? image.alt : `${image.alt}, view ${index + 1}`}
                      loading={index === 0 ? 'eager' : 'lazy'}
                      fetchPriority={index === 0 ? 'high' : 'auto'}
                      decoding="async"
                      sizes="(min-width: 1024px) 58vw, 100vw"
                      className="h-full w-full object-cover"
                    />
                  </div>
                ))}
              </div>

              {galleryImages.length > 1 && (
                <div className="mt-4 flex items-center justify-center gap-2 lg:hidden">
                  {galleryImages.map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => scrollToImage(index)}
                      aria-label={`View image ${index + 1} of ${galleryImages.length}`}
                      aria-current={selectedImageIndex === index}
                      className="flex h-6 w-8 items-center justify-center"
                    >
                      <span className={`h-px w-8 transition-[transform,background-color] duration-150 ease-[var(--motion-ease-out)] motion-reduce:transition-none ${
                        selectedImageIndex === index ? 'scale-x-100 bg-foreground' : 'scale-x-50 bg-stone'
                      }`} />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Details */}
        <div className="px-4 sm:px-0 lg:sticky lg:top-[104px] lg:col-span-4 lg:col-start-9 lg:self-start">
          {categoryPath.length > 0 && (
            <p className="text-label-caps text-foreground-faint">{categoryPath[categoryPath.length - 1].name}</p>
          )}
          <h1 className="mt-3 text-headline-lg">{product.name}</h1>

          <p className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[17px]">
            {saleIsActive && !hasVariantPrice ? (
              <>
                <span>{formatPrice(effectivePrice)}</span>
                <span className="text-sm text-foreground-faint line-through">{formatPrice(product.price)}</span>
                <span className="bg-espresso px-2 py-0.5 text-label-caps text-background">Sale</span>
              </>
            ) : (
              formatPrice(effectivePrice)
            )}
          </p>

          {/* Variant selectors */}
          {activeVariants.length > 0 && (
            <div className="mt-10 space-y-8">
              {hasColors && (
                <fieldset>
                  <legend className="mb-3 text-label-caps">
                    Colour
                    {selectedColor && (
                      <span className="ml-2 normal-case tracking-normal font-normal text-foreground-muted">{selectedColor}</span>
                    )}
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {allColors.map((color) => {
                      const available = activeVariants.some(
                        (v) => v.color === color && (!selectedSize || v.size === selectedSize) && v.stock > 0
                      );
                      const inCurrentFilter = !selectedSize || colorsForSize.includes(color);
                      const isSelected = selectedColor === color;
                      const enabled = available && inCurrentFilter;
                      return (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setSelectedColor(isSelected ? null : color)}
                          disabled={!enabled}
                          aria-pressed={isSelected}
                          className={`relative h-11 min-w-11 border px-4 text-[13px] capitalize transition-colors duration-150 motion-reduce:transition-none ${
                            isSelected
                              ? 'border-foreground bg-foreground text-background'
                              : enabled
                                ? 'border-border-subtle hover:border-foreground'
                                : 'cursor-not-allowed border-border-subtle text-foreground-faint unavailable-strike'
                          }`}
                        >
                          {color}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              {hasSizes && (
                <fieldset>
                  <legend className="mb-3 text-label-caps">
                    Size
                    {selectedSize && (
                      <span className="ml-2 normal-case tracking-normal font-normal text-foreground-muted">{selectedSize}</span>
                    )}
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {allSizes.map((size) => {
                      const available = activeVariants.some(
                        (v) => v.size === size && (!selectedColor || v.color === selectedColor) && v.stock > 0
                      );
                      const inCurrentFilter = !selectedColor || sizesForColor.includes(size);
                      const isSelected = selectedSize === size;
                      const enabled = available && inCurrentFilter;
                      return (
                        <button
                          key={size}
                          type="button"
                          onClick={() => setSelectedSize(isSelected ? null : size)}
                          disabled={!enabled}
                          aria-pressed={isSelected}
                          className={`relative h-11 min-w-11 border px-3 text-[13px] transition-colors duration-150 motion-reduce:transition-none ${
                            isSelected
                              ? 'border-foreground bg-foreground text-background'
                              : enabled
                                ? 'border-border-subtle hover:border-foreground'
                                : 'cursor-not-allowed border-border-subtle text-foreground-faint unavailable-strike'
                          }`}
                        >
                          {size}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              )}
            </div>
          )}

          {/* Stock note */}
          <p className="mt-6 min-h-5 text-[13px]" aria-live="polite">
            {soldOut ? (
              <span className="text-foreground-muted">Currently sold out</span>
            ) : selectedVariant ? (
              selectedVariant.stock === 0 ? (
                <span className="text-foreground-muted">This option is sold out</span>
              ) : selectedVariant.stock <= 3 ? (
                <span className="text-brass-text">Only {selectedVariant.stock} left</span>
              ) : (
                <span className="inline-flex items-center gap-2 text-olive">
                  <span className="h-1.5 w-1.5 rounded-full bg-olive" aria-hidden="true" />
                  In stock
                </span>
              )
            ) : null}
          </p>

          {/* Quantity + Add to bag */}
          <div className="mt-4 flex gap-3">
            <div className="flex h-[52px] items-center border border-border-subtle">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
                className="h-full px-4 text-foreground-muted hover:text-foreground transition-colors"
              >−</button>
              <span className="w-6 text-center text-sm tabular-nums" aria-live="polite">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(selectedVariant?.stock ?? 1, q + 1))}
                aria-label="Increase quantity"
                className="h-full px-4 text-foreground-muted hover:text-foreground transition-colors"
              >+</button>
            </div>

            <button
              type="button"
              onClick={handleAddToCart}
              disabled={soldOut || selectedVariant?.stock === 0 || addToCart.isPending}
              className="ui-press h-[52px] flex-1 bg-espresso text-label-caps text-background
                         hover:bg-espresso-hover disabled:cursor-not-allowed disabled:bg-surface-oat disabled:text-foreground-faint"
            >
              {buttonLabel}
            </button>
          </div>

          {showSelectionPrompt && needsSelection && (
            <p className="mt-3 text-[13px] text-destructive" role="alert">{selectionPrompt}</p>
          )}

          {added && (
            <div
              className="ui-feedback mt-4 flex items-center justify-between border border-border-subtle bg-surface px-4 py-3 text-[13px]"
              role="status"
            >
              <span className="inline-flex items-center gap-2">
                <Check strokeWidth={1.5} className="h-4 w-4 text-olive" aria-hidden="true" />
                Added to your bag
              </span>
              <Link to="/cart" className="text-label-caps underline decoration-[0.5px] underline-offset-[6px] hover:text-brass-text">
                View bag
              </Link>
            </div>
          )}

          {/* Description & service notes */}
          {product.description && (
            <div className="mt-10 border-t border-border pt-8">
              <h2 className="text-label-caps">Description</h2>
              <p className="mt-4 whitespace-pre-line text-[15px] leading-[1.7] text-foreground-muted">
                {product.description}
              </p>
            </div>
          )}

          <ul className="mt-8 space-y-3 border-t border-border pt-8 text-[13px] text-foreground-muted">
            <li className="flex items-center gap-3">
              <Truck strokeWidth={1} className="h-4 w-4 text-brass" aria-hidden="true" />
              Delivery options and rates shown at checkout
            </li>
            <li className="flex items-center gap-3">
              <Lock strokeWidth={1} className="h-4 w-4 text-brass" aria-hidden="true" />
              Secure checkout with PesaPal
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div className="border-t border-border-subtle">
      <ProductRail
        eyebrow={categoryPath.length > 0 ? categoryPath[categoryPath.length - 1].name : 'More to explore'}
        title="You may also like"
        products={relatedProducts}
        isLoading={relatedQuery.isLoading}
      />
    </div>
    </>
  );
}
