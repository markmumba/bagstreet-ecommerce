import type { Context } from "hono";
import { productsQueries } from "./products.queries";
import type { ProductRequest, ProductResponse } from "shared/dist";
import { success } from "@server/lib/response";
import { ConflictError, InternalServerError, NotFoundError, ValidationError } from "@server/lib/errors";
import { createProductSchema } from "./products.schema";
import { generateSku, slugify } from "@server/lib/util";

export const productsHandlers = {
    list: async (c: Context) => {

        const products = await productsQueries.findAll();

        const response:ProductResponse[] = products.map(product => ({
            id: product.id.toString(),
            name: product.name,
            sku: product.sku,
            description: product.description ?? '',
            price: product.price,
            stock: product.stock,
            image_url: product.image_url ?? '',
            is_active: product.is_active,
            created_at: product.created_at,
            updated_at: product.updated_at,
        }));
        return success(c, response);
    },
    get: async (c:Context) => {
        const id = parseInt(c.req.param('id'));
        const product = await productsQueries.findById(id);

        if (!product) {
            throw new NotFoundError('Product', id);
        }

        const response:ProductResponse = {
            id: product.id.toString(),
            name: product.name,
            sku: product.sku,
            description: product.description ?? '',
            price: product.price,
            stock: product.stock,
            image_url: product.image_url ?? '',
            is_active: product.is_active,
            created_at: product.created_at,
            updated_at: product.updated_at,
        };
        return success(c, response);
    },
    create: async (c:Context) => {
        const body = await c.req.json<ProductRequest>();
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
        
        const product = await productsQueries.create({
            ...validated.data!,
            sku,
            slug,
        } as ProductRequest & { sku: string; slug: string });
        if (!product) {
            throw new InternalServerError('Failed to create product');
        }

        const response:ProductResponse = {
            id: product.id.toString(),
            sku: product.sku,
            name: product.name,
            description: product.description ?? '',
            price: product.price,
            stock: product.stock,
            image_url: product.image_url ?? '',
            is_active: product.is_active,
            created_at: product.created_at,
            updated_at: product.updated_at,
        };


        return success(c, response);
    }
}

