import type { Context } from "hono";
import { productsQueries } from "./products.queries";
import type { ProductRequest, ProductResponse, ProductUpdateRequest } from "shared/dist";
import { success, paginated } from "@server/lib/response";
import { BadRequestError, ConflictError, InternalServerError, NotFoundError, ValidationError } from "@server/lib/errors";
import { createProductSchema, updateProductSchema } from "./products.schema";
import { generateSku, slugify } from "@server/lib/util";
import { imageUploadService } from "@server/services/image.upload.service";

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

        const response: ProductResponse[] = products.map((product: any) => ({
            id: product.id.toString(),
            category_id: product.category_id,
            name: product.name,
            sku: product.sku,
            description: product.description ?? '',
            price: product.price,
            stock: product.stock,
            total_stock: product.total_stock != null ? parseInt(product.total_stock, 10) : 0,
            image_url: product.image_url ?? '',
            is_active: product.is_active,
            is_featured: product.is_featured ?? false,
            created_at: product.created_at,
            updated_at: product.updated_at,
        }));

        return paginated(c, response, page, limit, total);
    },

    get: async (c: Context) => {
        const id = parseInt(c.req.param('id'));
        const product = await productsQueries.findById(id);

        if (!product) {
            throw new NotFoundError('Product', id);
        }

        const response: ProductResponse = {
            id: product.id.toString(),
            category_id: product.category_id,
            name: product.name,
            sku: product.sku,
            description: product.description ?? '',
            price: product.price,
            stock: product.stock,
            image_url: product.image_url ?? '',
            is_active: product.is_active,
            is_featured: product.is_featured ?? false,
            created_at: product.created_at,
            updated_at: product.updated_at,
        };
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

            const response: ProductResponse = {
                id: product.id.toString(),
                category_id: product.category_id,
                sku: product.sku,
                name: product.name,
                description: product.description ?? '',
                price: product.price,
                stock: product.stock,
                image_url: product.image_url ?? '',
                is_active: product.is_active,
                is_featured: product.is_featured ?? false,
                created_at: product.created_at,
                updated_at: product.updated_at,
            };

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
        const body = await c.req.json<ProductUpdateRequest>();
        const validated = updateProductSchema.safeParse(body);
        if (!validated.success) {
            throw new ValidationError('Invalid product data', validated.error.errors);
        }

        const existingProduct = await productsQueries.findById(id);
        if (!existingProduct) {
            throw new NotFoundError('Product', id);
        }
        const updatedProduct = await productsQueries.update(id, validated.data!);
        if (!updatedProduct) {
            throw new InternalServerError('Failed to update product');
        }
        const response: ProductResponse = {
            id: updatedProduct.id.toString(),
            category_id: updatedProduct.category_id,
            sku: updatedProduct.sku,
            name: updatedProduct.name,
            description: updatedProduct.description ?? '',
            price: updatedProduct.price,
            stock: updatedProduct.stock,
            image_url: updatedProduct.image_url ?? '',
            is_active: updatedProduct.is_active,
            is_featured: updatedProduct.is_featured ?? false,
            created_at: updatedProduct.created_at,
            updated_at: updatedProduct.updated_at,
        };
        return success(c, response);
    },

    delete: async (c: Context) => {
        const id = parseInt(c.req.param('id')!);
        const product = await productsQueries.findById(id);
        if (!product) {
            throw new NotFoundError('Product', id);
        }
        await productsQueries.delete(id);
        return success(c, null, 'Product deleted successfully');
    }
}

