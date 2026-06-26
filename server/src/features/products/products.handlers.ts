import type { Context } from "hono";
import { productsQueries } from "./products.queries";
import { ordersQueries } from "../orders/orders.queries";
import type { ProductDeleteResponse, ProductRequest, ProductResponse, ProductUpdateRequest } from "shared/dist";
import { success, paginated } from "@server/lib/response";
import { BadRequestError, ConflictError, InternalServerError, NotFoundError, ValidationError } from "@server/lib/errors";
import { createProductSchema, updateProductSchema } from "./products.schema";
import { generateSku, slugify } from "@server/lib/util";
import { imageUploadService } from "@server/services/image.upload.service";

function toProductResponse(product: any): ProductResponse {
    return {
        id: product.id.toString(),
        category_id: product.category_id,
        name: product.name,
        sku: product.sku,
        description: product.description ?? '',
        price: parseFloat(product.price),
        sale_price: product.sale_price != null ? parseFloat(product.sale_price) : undefined,
        sale_ends_at: product.sale_ends_at ?? undefined,
        stock: product.stock,
        total_stock: product.total_stock != null ? parseInt(product.total_stock, 10) : undefined,
        image_url: product.image_url ?? '',
        is_active: product.is_active,
        is_featured: product.is_featured ?? false,
        created_at: product.created_at,
        updated_at: product.updated_at,
    };
}

export const productsHandlers = {
    list: async (c: Context) => {
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

        const response: ProductResponse[] = products.map(toProductResponse);

        return paginated(c, response, page, limit, total);
    },

    get: async (c: Context) => {
        const id = parseInt(c.req.param('id')!);
        const product = await productsQueries.findById(id);

        if (!product) {
            throw new NotFoundError('Product', id);
        }

        const response: ProductResponse = toProductResponse(product);
        return success(c, response);
    },
    create: async (c: Context) => {
        const formData = await c.req.formData();

        const body = {
            category_id: parseInt(formData.get('category_id') as string, 10),
            name: formData.get('name') as string,
            description: formData.get('description') as string,
            price: parseFloat(formData.get('price') as string),
            stock: parseInt(formData.get('stock') as string, 10),
            image_file: formData.get('image_file') as File,
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
        let uploadedFilename = null;
        try {
            const result = validated.data!.image_file ? await imageUploadService.upload(validated.data!.image_file) : null;
            imageUrl = result?.url;
            uploadedFilename = result?.filename;


            const product = await productsQueries.create({
                ...validated.data!,
                image_url: imageUrl,
                sku,
                slug,
            } as unknown as ProductRequest & { sku: string; slug: string });
            if (!product) {
                if (uploadedFilename) {
                    await imageUploadService.delete(uploadedFilename);
                }
                throw new InternalServerError('Failed to create product');
            }

            const response: ProductResponse = toProductResponse(product);

            return success(c, response);
        } catch (error) {
            if(uploadedFilename && error instanceof InternalServerError ){
                await imageUploadService.delete(uploadedFilename).catch(()=>{});
            }
            throw error;
        }
    },
    update: async (c: Context) => {
        const id = parseInt(c.req.param('id')!);
        const contentType = c.req.header('Content-Type') ?? '';

        let updateData: { name?: string; description?: string; price?: number; image_url?: string; is_active?: boolean; is_featured?: boolean; sale_price?: number | null; sale_ends_at?: string | null } = {};

        if (contentType.includes('multipart/form-data')) {
            const formData = await c.req.formData();
            const name = formData.get('name') as string | null;
            const description = formData.get('description') as string | null;
            const priceStr = formData.get('price') as string | null;
            const isActiveStr = formData.get('is_active') as string | null;
            const imageFile = formData.get('image_file') as File | null;

            if (name) updateData.name = name.trim();
            if (description !== null) updateData.description = description.trim();
            if (priceStr) updateData.price = parseFloat(priceStr);
            if (isActiveStr !== null) updateData.is_active = isActiveStr === 'true';

            if (imageFile && imageFile.size > 0) {
                const existingProduct = await productsQueries.findById(id);
                if (!existingProduct) throw new NotFoundError('Product', id);
                // Upload new image
                const result = await imageUploadService.upload(imageFile);
                if (result?.url) updateData.image_url = result.url;
                // Delete old image if it existed
                if (existingProduct.image_url) {
                    const oldFilename = existingProduct.image_url.split('/').pop();
                    if (oldFilename) imageUploadService.delete(oldFilename).catch(() => {});
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

        const response: ProductResponse = toProductResponse(updatedProduct);
        return success(c, response);
    },

    setSale: async (c: Context) => {
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

        return success(c, toProductResponse(updated), body.sale_price == null ? 'Sale removed' : 'Sale updated');
    },

    onSale: async (c: Context) => {
        const products = await productsQueries.findOnSale();
        return success(c, products.map(toProductResponse));
    },

    delete: async (c: Context) => {
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

            return success(c, response, 'Product has order history and was deactivated');
        }

        await productsQueries.delete(id);
        const response: ProductDeleteResponse = {
            action: 'deleted',
            product_id: product.id.toString(),
        };

        return success(c, response, 'Product deleted successfully');
    }
}
