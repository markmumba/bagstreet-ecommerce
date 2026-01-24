import type { Context } from "hono";
import { categoriesQueries } from "./categories.queries";
import { success } from "@server/lib/response";
import { ConflictError, InternalServerError, NotFoundError, ValidationError } from "@server/lib/errors";
import {  createCategorySchema,updateCategorySchema } from "./categories.schema";
import type { CategoryRequest, CategoryResponse } from "shared/dist";


export const categoriesHandlers = {

    list: async (c: Context) => {
        const searchTerm = c.req.query('search');
        const categories = searchTerm ? await categoriesQueries.search(searchTerm) : await categoriesQueries.findAll();

        const response: CategoryResponse[] = categories.map(category => ({
            id: category.id.toString(),
            name: category.name,
            description: category.description ?? '',
            created_at: category.created_at,
            updated_at: category.updated_at,
        }));

        return success(c, response);
    },

    get:async (c: Context) => {

        const id = parseInt(c.req.param('id'));
        const category = await categoriesQueries.findById(id);

        if (!category) {
            throw new NotFoundError('Category', id);
        }
        const response: CategoryResponse = {
            id: category.id.toString(),
            name: category.name,
            description: category.description ?? null,
            created_at: category.created_at,
            updated_at: category.updated_at,
        };
        return success(c, response);
    },

    create: async (c: Context) => {

        const body = await  c.req.json<CategoryRequest>();
        const validated = createCategorySchema.safeParse(body);
        const slug = slugify(validated.data!.name);

        const existingCategory = await categoriesQueries.findBySlug(slug);
        if (existingCategory) {
            throw new ConflictError('Category with this name already exists');
        }

        const category = await categoriesQueries.create(validated.data!.name, slug, validated.data!.description ?? null);

        if (!category) {
            throw new InternalServerError('Failed to create category');
        }

        const response: CategoryResponse = {
            id: category.id.toString(),
            name: category.name,
            description: category.description ?? '',
            created_at: category.created_at,
            updated_at: category.updated_at,
        };
        return success(c, response, 'Category created successfully', 201);

    },

    update: async (c: Context) => {
        const id = parseInt(c.req.param('id'));
        const body = await c.req.json<CategoryRequest>();
        const validated = updateCategorySchema.safeParse(body);

        if (!validated.success) {
            throw new ValidationError('Invalid category data', validated.error.errors);
        }
        const existingCategory = await categoriesQueries.findById(id);
        if (!existingCategory) {
            throw new NotFoundError('Category', id);
        }

        const updateData:any = {}
        if (validated.data!.name !== undefined) {
            updateData.name = validated.data!.name;
            updateData.slug = slugify(validated.data!.name);
        }
        if (validated.data!.description !== undefined) {
            updateData.description = validated.data!.description;
        }
        const updatedCategory = await categoriesQueries.update(id, updateData);

        if (!updatedCategory) {
            throw new InternalServerError('Failed to update category');
        }

        const response: CategoryResponse = {
            id: updatedCategory.id.toString(),
            name: updatedCategory.name,
            description: updatedCategory.description ?? '',
            created_at: updatedCategory.created_at,
            updated_at: updatedCategory.updated_at,
        };
        return success(c, response, 'Category updated successfully');
    },

    delete: async (c: Context) => {

        const id = parseInt(c.req.param('id'));
        const category = await categoriesQueries.findById(id);
        if (!category) {
            throw new NotFoundError('Category', id);
        }
        const count = await categoriesQueries.countProducts(id);
        if (count && count > 0) {
            throw new ConflictError('Category has products');
        }
        await categoriesQueries.delete(id);
        return success(c, null, 'Category deleted successfully');
    }

}

function slugify(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }