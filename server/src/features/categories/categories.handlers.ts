import type { Context } from "hono";
import { categoriesQueries } from "./categories.queries";
import { success, paginated } from "@server/lib/response";
import { BadRequestError, ConflictError, InternalServerError, NotFoundError, ValidationError } from "@server/lib/errors";
import { createCategorySchema, updateCategorySchema } from "./categories.schema";
import { slugify } from "@server/lib/util";
import type { CategoryRequest, CategoryResponse } from "shared/dist";

function toCategoryResponse(category: any): CategoryResponse {
    return {
        id: category.id.toString(),
        name: category.name,
        description: category.description ?? '',
        created_at: category.created_at,
        updated_at: category.updated_at,
    };
}

export const categoriesHandlers = {

    list: async (c: Context) => {
        const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
        const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '100', 10)));
        const search = c.req.query('search') ?? '';

        const [categories, total] = await Promise.all([
            categoriesQueries.findAll(page, limit, search),
            categoriesQueries.countAll(search),
        ]);

        return paginated(c, categories.map(toCategoryResponse), page, limit, total);
    },

    get: async (c: Context) => {
        const id = parseInt(c.req.param('id'));
        const category = await categoriesQueries.findById(id);
        if (!category) throw new NotFoundError('Category', id);
        return success(c, toCategoryResponse(category));
    },

    create: async (c: Context) => {
        const body = await c.req.json<CategoryRequest>();
        const validated = createCategorySchema.safeParse(body);
        if (!validated.success) throw new ValidationError('Invalid category data', validated.error.errors);

        const slug = slugify(validated.data.name);
        const existing = await categoriesQueries.findBySlug(slug);
        if (existing) throw new ConflictError('Category with this name already exists');

        const category = await categoriesQueries.create(validated.data.name, slug, validated.data.description ?? null);
        if (!category) throw new InternalServerError('Failed to create category');

        return success(c, toCategoryResponse(category), 'Category created successfully', 201);
    },

    update: async (c: Context) => {
        const id = parseInt(c.req.param('id'));
        const body = await c.req.json<CategoryRequest>();
        const validated = updateCategorySchema.safeParse(body);
        if (!validated.success) throw new ValidationError('Invalid category data', validated.error.errors);

        const existing = await categoriesQueries.findById(id);
        if (!existing) throw new NotFoundError('Category', id);

        const updateData: any = {};
        if (validated.data.name !== undefined) {
            updateData.name = validated.data.name;
            updateData.slug = slugify(validated.data.name);
        }
        if (validated.data.description !== undefined) {
            updateData.description = validated.data.description;
        }

        const updated = await categoriesQueries.update(id, updateData);
        if (!updated) throw new InternalServerError('Failed to update category');

        return success(c, toCategoryResponse(updated), 'Category updated successfully');
    },

    delete: async (c: Context) => {
        const id = parseInt(c.req.param('id'));
        const category = await categoriesQueries.findById(id);
        if (!category) throw new NotFoundError('Category', id);

        const count = await categoriesQueries.countProducts(id);
        if (count && count > 0) throw new ConflictError('Category has products');

        await categoriesQueries.delete(id);
        return success(c, null, 'Category deleted successfully');
    },
};
