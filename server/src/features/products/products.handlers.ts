import type { AppContext } from '@server/lib/hono';
import { productsQueries } from "./products.queries";
import { ordersQueries } from "../orders/orders.queries";
import { categoriesQueries } from "../categories/categories.queries";
import type { ProductDeleteResponse, ProductRequest, ProductResponse, ProductUpdateRequest } from "shared/dist";
import { success, paginated } from "@server/lib/response";
import { BadRequestError, ConflictError, InternalServerError, NotFoundError, ValidationError } from "@server/lib/errors";
import { createProductSchema, updateProductSchema } from "./products.schema";
import { generateSku, slugify } from "@server/lib/util";
import { imageUploadService } from "@server/services/image-upload-service";
import {
    csvTextFromRequest,
    parseBoolean,
    parseCsv,
    parseOptionalNumber,
    parseRequiredNumber,
    type ImportReport,
} from "@server/lib/csv-import";
import { auditFromContext } from "@server/lib/audit";

function toProductResponse(product: any): ProductResponse {
    const images = (product.images ?? []).map((image: any) => ({
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

function getImageFiles(formData: FormData) {
    const files = formData
        .getAll('image_files')
        .filter((value): value is File => value instanceof File && value.size > 0);
    const legacyFile = formData.get('image_file');

    if (files.length > 0) return files;
    if (legacyFile instanceof File && legacyFile.size > 0) return [legacyFile];
    return [];
}

function filenameFromUrl(url: string) {
    try {
        return new URL(url).pathname.split('/').pop() ?? null;
    } catch {
        return url.split('/').pop() ?? null;
    }
}

async function deleteImageUrls(urls: string[]) {
    await Promise.allSettled(
        urls.map((url) => {
            const filename = filenameFromUrl(url);
            return filename ? imageUploadService.delete(filename) : Promise.resolve();
        }),
    );
}

function groupImagesByProductId(images: Awaited<ReturnType<typeof productsQueries.findImagesByProductIds>>) {
    const imagesByProductId = new Map<number, typeof images>();
    for (const image of images) {
        const existing = imagesByProductId.get(image.product_id) ?? [];
        existing.push(image);
        imagesByProductId.set(image.product_id, existing);
    }
    return imagesByProductId;
}

function splitImageUrls(value: string | undefined) {
    return (value ?? '')
        .split(/[;|]/)
        .map((url) => url.trim())
        .filter(Boolean);
}

function parseOptionalDate(value: string | undefined): string | null {
    const raw = (value ?? '').trim();
    if (!raw) return null;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid date "${value}"`);
    return parsed.toISOString();
}

export const productsHandlers = {
    list: async (c: AppContext) => {
        const pageParam = c.req.query('page');
        const limitParam = c.req.query('limit');
        const categoryParameter = c.req.query('categoryId');
        const searchParam = c.req.query('searchTerm');
        const status = c.req.query('status');

        const page = pageParam ? parseInt(pageParam, 10) : 1;
        const limit = limitParam ? parseInt(limitParam, 10) : 10;
        const categoryId = categoryParameter ? parseInt(categoryParameter, 10) : null;
        const searchTerm = searchParam ?? '';
        const productStatus = status === 'true' ? true : status === 'false' ? false : null;

        if (page < 1) {
            throw new BadRequestError('Page must be greater than 0');
        }
        if (limit < 1 || limit > 100) {
            throw new BadRequestError('Limit must be between 1 and 100');
        }

        const [products, total] = await Promise.all([
            productsQueries.findAll(page, limit, categoryId, searchTerm, productStatus),
            productsQueries.countAll(categoryId, searchTerm)
        ]);

        const imageRows = await productsQueries.findImagesByProductIds(products.map((product) => Number(product.id)));
        const imagesByProductId = groupImagesByProductId(imageRows);
        const response: ProductResponse[] = products.map((product) => toProductResponse({
            ...product,
            images: imagesByProductId.get(Number(product.id)) ?? [],
        }));

        return paginated(c, response, page, limit, total);
    },

    get: async (c: AppContext) => {
        const ref = c.req.param('id')!;
        const product = /^\d+$/.test(ref)
            ? await productsQueries.findById(parseInt(ref, 10))
            : await productsQueries.findBySlug(ref);

        if (!product) {
            throw new NotFoundError('Product', ref);
        }

        const images = await productsQueries.findImagesByProductId(Number(product.id));
        const response: ProductResponse = toProductResponse({ ...product, images });
        return success(c, response);
    },
    create: async (c: AppContext) => {
        const formData = await c.req.formData();

        const body = {
            category_id: parseInt(formData.get('category_id') as string, 10),
            name: formData.get('name') as string,
            description: formData.get('description') as string,
            price: parseFloat(formData.get('price') as string),
            stock: parseInt(formData.get('stock') as string, 10),
            image_file: getImageFiles(formData)[0],
            is_active: formData.get('is_active') === 'true',
        };

        const validated = createProductSchema.safeParse(body);

        if (!validated.success) {
            throw new ValidationError('Invalid product data', validated.error.errors);
        }
        const sku = generateSku();
        const slug = slugify(validated.data!.name);
        const existingProduct = await productsQueries.findBySlug(slug);

        if (existingProduct) {
            throw new ConflictError('Product with this name already exists');
        }

        let imageUrl = null;
        let uploadedFilenames: string[] = [];
        try {
            const uploadedImages = [];
            for (const imageFile of getImageFiles(formData)) {
                uploadedImages.push(await imageUploadService.upload(imageFile));
            }
            imageUrl = uploadedImages[0]?.url;
            uploadedFilenames = uploadedImages.map((image) => image.filename);


            const product = await productsQueries.create({
                ...validated.data!,
                image_url: imageUrl,
                sku,
                slug,
            } as unknown as ProductRequest & { sku: string; slug: string });
            if (!product) {
                await Promise.allSettled(uploadedFilenames.map((filename) => imageUploadService.delete(filename)));
                throw new InternalServerError('Failed to create product');
            }

            if (uploadedImages.length > 0) {
                await productsQueries.replaceImages(Number(product.id), uploadedImages.map((image, index) => ({
                    url: image.url,
                    alt_text: validated.data!.name,
                    position: index,
                    is_primary: index === 0,
                })));
            }

            const images = await productsQueries.findImagesByProductId(Number(product.id));
            const response: ProductResponse = toProductResponse({ ...product, image_url: imageUrl, images });
            await auditFromContext(c, {
                action: 'PRODUCT_CREATED',
                entityType: 'product',
                entityId: product.id,
                after: response,
            });

            return success(c, response);
        } catch (error) {
            await Promise.allSettled(uploadedFilenames.map((filename) => imageUploadService.delete(filename)));
            throw error;
        }
    },

    importCsv: async (c: AppContext) => {
        const text = await csvTextFromRequest(c.req.raw);
        const rows = parseCsv(text, ['name', 'price']);
        const categories = await categoriesQueries.findAllFlat();
        const categoryById = new Map(categories.map((category) => [String(category.id), category]));
        const categoryByName = new Map(categories.map((category) => [category.name.trim().toLowerCase(), category]));
        const categoryBySlug = new Map(categories.map((category) => [slugify(category.name), category]));
        const seenSlugs = new Set<string>();
        const report: ImportReport = {
            total_rows: rows.length,
            created: 0,
            skipped: 0,
            failed: 0,
            errors: [],
        };

        for (const row of rows) {
            try {
                const name = row.values.name?.trim();
                if (!name) throw new Error('name is required');

                const slug = slugify(name);
                if (seenSlugs.has(slug)) {
                    report.skipped += 1;
                    report.errors.push({ row: row.rowNumber, message: `Skipped duplicate product "${name}" in this CSV` });
                    continue;
                }

                const existing = await productsQueries.findBySlugAnyStatus(slug);
                if (existing) {
                    report.skipped += 1;
                    report.errors.push({ row: row.rowNumber, message: `Skipped duplicate product "${name}"` });
                    continue;
                }

                const categoryRef = row.values.category_id || row.values.category || row.values.category_slug || '';
                const category = categoryById.get(categoryRef)
                    ?? categoryBySlug.get(slugify(categoryRef))
                    ?? categoryByName.get(categoryRef.trim().toLowerCase());

                if (!category) {
                    throw new Error('category_id, category, or category_slug must match an existing category');
                }

                const price = parseRequiredNumber(row.values.price, 'price');
                const stock = parseOptionalNumber(row.values.stock) ?? 0;
                const salePrice = parseOptionalNumber(row.values.sale_price);
                const saleEndsAt = parseOptionalDate(row.values.sale_ends_at);
                if (salePrice !== undefined && salePrice >= price) {
                    throw new Error('sale_price must be lower than price');
                }

                const imageUrls = [
                    ...splitImageUrls(row.values.image_urls),
                    ...splitImageUrls(row.values.image_url),
                ].filter((url, index, all) => all.indexOf(url) === index);

                const productData = {
                    category_id: Number(category.id),
                    name,
                    description: row.values.description?.trim() || null,
                    price,
                    stock,
                    image_file: undefined,
                    is_active: parseBoolean(row.values.is_active, true),
                };

                const validated = createProductSchema.safeParse(productData);
                if (!validated.success) throw new Error(validated.error.errors[0]?.message ?? 'Invalid product row');

                const product = await productsQueries.create({
                    ...validated.data,
                    image_url: imageUrls[0] ?? null,
                    sku: row.values.sku?.trim() || generateSku(),
                    slug,
                } as unknown as ProductRequest & { sku: string; slug: string });
                if (!product) throw new Error('Failed to create product');

                const updates: ProductUpdateRequest = {};
                if (row.values.is_featured) updates.is_featured = parseBoolean(row.values.is_featured, false);
                if (salePrice !== undefined) updates.sale_price = salePrice;
                if (salePrice !== undefined || saleEndsAt) updates.sale_ends_at = saleEndsAt;
                if (Object.keys(updates).length > 0) {
                    await productsQueries.update(Number(product.id), updates);
                }

                if (imageUrls.length > 0) {
                    await productsQueries.replaceImages(Number(product.id), imageUrls.map((url, index) => ({
                        url,
                        alt_text: name,
                        position: index,
                        is_primary: index === 0,
                    })));
                }

                seenSlugs.add(slug);
                report.created += 1;
            } catch (error) {
                report.failed += 1;
                report.errors.push({
                    row: row.rowNumber,
                    message: error instanceof Error ? error.message : 'Failed to import product',
                });
            }
        }

        return success(c, report, 'Product CSV import complete', 201);
    },
    update: async (c: AppContext) => {
        const id = parseInt(c.req.param('id')!);
        const contentType = c.req.header('Content-Type') ?? '';

        let updateData: { name?: string; description?: string; price?: number; image_url?: string; is_active?: boolean; is_featured?: boolean; sale_price?: number | null; sale_ends_at?: string | null } = {};

        if (contentType.includes('multipart/form-data')) {
            const formData = await c.req.formData();
            const name = formData.get('name') as string | null;
            const description = formData.get('description') as string | null;
            const priceStr = formData.get('price') as string | null;
            const isActiveStr = formData.get('is_active') as string | null;
            const imageFiles = getImageFiles(formData);

            if (name) updateData.name = name.trim();
            if (description !== null) updateData.description = description.trim();
            if (priceStr) updateData.price = parseFloat(priceStr);
            if (isActiveStr !== null) updateData.is_active = isActiveStr === 'true';

            if (imageFiles.length > 0) {
                const existingProduct = await productsQueries.findById(id);
                if (!existingProduct) throw new NotFoundError('Product', id);
                const oldImages = await productsQueries.findImagesByProductId(id);
                const uploadedImages = [];
                try {
                    for (const imageFile of imageFiles) {
                        uploadedImages.push(await imageUploadService.upload(imageFile));
                    }
                    if (uploadedImages[0]?.url) updateData.image_url = uploadedImages[0].url;
                    await productsQueries.replaceImages(id, uploadedImages.map((image, index) => ({
                        url: image.url,
                        alt_text: name?.trim() || existingProduct.name,
                        position: index,
                        is_primary: index === 0,
                    })));
                    const oldUrls = oldImages.length > 0
                        ? oldImages.map((image) => image.url)
                        : existingProduct.image_url ? [existingProduct.image_url] : [];
                    deleteImageUrls(oldUrls).catch(() => {});
                } catch (error) {
                    await Promise.allSettled(uploadedImages.map((image) => imageUploadService.delete(image.filename)));
                    throw error;
                }
            }
        } else {
            const body = await c.req.json<ProductUpdateRequest>();
            const validated = updateProductSchema.safeParse(body);
            if (!validated.success) throw new ValidationError('Invalid product data', validated.error.errors);
            updateData = validated.data!;
        }

        const existingProduct = await productsQueries.findById(id);
        if (!existingProduct) throw new NotFoundError('Product', id);

        const updatedProduct = await productsQueries.update(id, updateData);
        if (!updatedProduct) throw new InternalServerError('Failed to update product');

        const images = await productsQueries.findImagesByProductId(id);
        const response: ProductResponse = toProductResponse({ ...updatedProduct, images });
        await auditFromContext(c, {
            action: 'PRODUCT_UPDATED',
            entityType: 'product',
            entityId: id,
            before: existingProduct,
            after: response,
            metadata: { fields: Object.keys(updateData) },
        });
        return success(c, response);
    },

    setSale: async (c: AppContext) => {
        const id = parseInt(c.req.param('id')!);
        const body = await c.req.json<{ sale_price: number | null; sale_ends_at?: string | null }>();

        const product = await productsQueries.findByIdAnyStatus(id);
        if (!product) throw new NotFoundError('Product', id);

        if (body.sale_price !== null && (typeof body.sale_price !== 'number' || body.sale_price < 0)) {
            throw new BadRequestError('sale_price must be a non-negative number or null');
        }
        if (body.sale_price !== null && body.sale_price >= Number((product as any).price)) {
            throw new BadRequestError('sale_price must be lower than the regular price');
        }

        const updated = await productsQueries.setSale(id, {
            sale_price: body.sale_price,
            sale_ends_at: body.sale_ends_at ?? null,
        });
        if (!updated) throw new InternalServerError('Failed to update sale');

        const images = await productsQueries.findImagesByProductId(id);
        const response = toProductResponse({ ...updated, images });
        await auditFromContext(c, {
            action: 'PRODUCT_SALE_UPDATED',
            entityType: 'product',
            entityId: id,
            before: { sale_price: product.sale_price, sale_ends_at: product.sale_ends_at },
            after: { sale_price: updated.sale_price, sale_ends_at: updated.sale_ends_at },
        });
        return success(c, response, body.sale_price == null ? 'Sale removed' : 'Sale updated');
    },

    onSale: async (c: AppContext) => {
        const products = await productsQueries.findOnSale();
        const imageRows = await productsQueries.findImagesByProductIds(products.map((product) => Number(product.id)));
        const imagesByProductId = groupImagesByProductId(imageRows);
        return success(c, products.map((product) => toProductResponse({
            ...product,
            images: imagesByProductId.get(Number(product.id)) ?? [],
        })));
    },

    delete: async (c: AppContext) => {
        const id = parseInt(c.req.param('id')!);
        const product = await productsQueries.findByIdAnyStatus(id);
        if (!product) {
            throw new NotFoundError('Product', id);
        }

        const isInOrder = await ordersQueries.findProductInOrders(Number(product.id));
        if (isInOrder) {
            await productsQueries.deactivate(Number(product.id));
            const response: ProductDeleteResponse = {
                action: 'deactivated',
                product_id: product.id.toString(),
            };
            await auditFromContext(c, {
                action: 'PRODUCT_DEACTIVATED',
                entityType: 'product',
                entityId: product.id,
                before: product,
                after: { ...product, is_active: false },
                metadata: { reason: 'product_has_order_history' },
            });

            return success(c, response, 'Product has order history and was deactivated');
        }

        await productsQueries.delete(id);
        const response: ProductDeleteResponse = {
            action: 'deleted',
            product_id: product.id.toString(),
        };
        await auditFromContext(c, {
            action: 'PRODUCT_DELETED',
            entityType: 'product',
            entityId: product.id,
            before: product,
        });

        return success(c, response, 'Product deleted successfully');
    }
}
