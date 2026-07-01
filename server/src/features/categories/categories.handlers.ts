import type { AppContext } from '@server/lib/hono';
import { categoriesQueries } from "./categories.queries";
import { success, paginated } from "@server/lib/response";
import { BadRequestError, ConflictError, InternalServerError, NotFoundError, ValidationError } from "@server/lib/errors";
import { createCategorySchema, updateCategorySchema } from "./categories.schema";
import { slugify } from "@server/lib/util";
import type { CategoryRequest, CategoryResponse, CategoryTreeNode } from "shared/dist";
import { csvTextFromRequest, parseCsv, type ImportReport } from "@server/lib/csv-import";
import { auditFromContext } from "@server/lib/audit";

function toCategoryResponse(category: any): CategoryResponse {
    return {
        id: category.id.toString(),
        name: category.name,
        description: category.description ?? '',
        parent_id: category.parent_id != null ? category.parent_id.toString() : null,
        parent_name: category.parent_name ?? undefined,
        children_count: category.children_count ?? 0,
        created_at: category.created_at,
        updated_at: category.updated_at,
    };
}

export const categoriesHandlers = {

    list: async (c: AppContext) => {
        const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
        const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '100', 10)));
        const search = c.req.query('search') ?? '';

        const [categories, total] = await Promise.all([
            categoriesQueries.findAll(page, limit, search),
            categoriesQueries.countAll(search),
        ]);

        return paginated(c, categories.map(toCategoryResponse), page, limit, total);
    },

    get: async (c: AppContext) => {
        const id = parseInt(c.req.param('id')!);
        const category = await categoriesQueries.findById(id);
        if (!category) throw new NotFoundError('Category', id);
        return success(c, toCategoryResponse(category));
    },

    create: async (c: AppContext) => {
        const body = await c.req.json<CategoryRequest>();
        const validated = createCategorySchema.safeParse(body);
        if (!validated.success) throw new ValidationError('Invalid category data', validated.error.errors);

        const parentId = validated.data.parent_id ?? null;
        if (parentId != null) {
            const parent = await categoriesQueries.findById(parentId);
            if (!parent) throw new NotFoundError('Parent category', parentId);
        }

        const slug = slugify(validated.data.name);
        const existing = await categoriesQueries.findBySlug(slug);
        if (existing) throw new ConflictError('Category with this name already exists');

        const category = await categoriesQueries.create(validated.data.name, slug, validated.data.description ?? null, parentId);
        if (!category) throw new InternalServerError('Failed to create category');
        await auditFromContext(c, {
            action: 'CATEGORY_CREATED',
            entityType: 'category',
            entityId: category.id,
            after: toCategoryResponse(category),
        });

        return success(c, toCategoryResponse(category), 'Category created successfully', 201);
    },

    importCsv: async (c: AppContext) => {
        const text = await csvTextFromRequest(c.req.raw);
        const rows = parseCsv(text, ['name']);
        const report: ImportReport = {
            total_rows: rows.length,
            created: 0,
            skipped: 0,
            failed: 0,
            errors: [],
        };

        const existingCategories = await categoriesQueries.findAllFlat();
        const categoriesByName = new Map(existingCategories.map((category) => [category.name.trim().toLowerCase(), category]));
        const categoriesBySlug = new Map(existingCategories.map((category) => [slugify(category.name), category]));

        for (const row of rows) {
            const name = row.values.name?.trim();
            const description = row.values.description?.trim() || null;
            const parentName = row.values.parent_name?.trim() || row.values.parent?.trim() || '';
            const slug = name ? slugify(name) : '';

            try {
                if (!name) throw new Error('name is required');

                if (categoriesBySlug.has(slug)) {
                    report.skipped += 1;
                    report.errors.push({ row: row.rowNumber, message: `Skipped duplicate category "${name}"` });
                    continue;
                }

                let parentId: number | null = null;
                if (parentName) {
                    const parent = categoriesByName.get(parentName.toLowerCase());
                    if (!parent) throw new Error(`Parent category "${parentName}" was not found`);
                    parentId = Number(parent.id);
                }

                const validated = createCategorySchema.safeParse({ name, description, parent_id: parentId });
                if (!validated.success) throw new Error(validated.error.errors[0]?.message ?? 'Invalid category row');

                const category = await categoriesQueries.create(name, slug, description, parentId);
                if (!category) throw new Error('Failed to create category');

                report.created += 1;
                categoriesByName.set(category.name.trim().toLowerCase(), {
                    ...category,
                    parent_name: null,
                    children_count: 0,
                });
                categoriesBySlug.set(slug, {
                    ...category,
                    parent_name: null,
                    children_count: 0,
                });
            } catch (error) {
                report.failed += 1;
                report.errors.push({
                    row: row.rowNumber,
                    message: error instanceof Error ? error.message : 'Failed to import category',
                });
            }
        }

        return success(c, report, 'Category CSV import complete', 201);
    },

    update: async (c: AppContext) => {
        const id = parseInt(c.req.param('id')!);
        const body = await c.req.json<CategoryRequest>();
        const validated = updateCategorySchema.safeParse(body);
        if (!validated.success) throw new ValidationError('Invalid category data', validated.error.errors);

        const existing = await categoriesQueries.findById(id);
        if (!existing) throw new NotFoundError('Category', id);

        if ('parent_id' in validated.data && validated.data.parent_id != null) {
            const parentId = validated.data.parent_id;
            const parent = await categoriesQueries.findById(parentId);
            if (!parent) throw new NotFoundError('Parent category', parentId);
            // Circular ref check: parent cannot be a descendant of self
            const descendants = await categoriesQueries.findDescendantIds(id);
            const descendantIds = descendants.map(d => d.id);
            if (descendantIds.includes(parentId)) {
                throw new BadRequestError('Cannot set a descendant as parent (circular reference)');
            }
        }

        const updateData: any = {};
        if (validated.data.name !== undefined) {
            updateData.name = validated.data.name;
            updateData.slug = slugify(validated.data.name);
        }
        if (validated.data.description !== undefined) {
            updateData.description = validated.data.description;
        }
        if ('parent_id' in validated.data) {
            updateData.parent_id = validated.data.parent_id ?? null;
        }

        const updated = await categoriesQueries.update(id, updateData);
        if (!updated) throw new InternalServerError('Failed to update category');
        await auditFromContext(c, {
            action: 'CATEGORY_UPDATED',
            entityType: 'category',
            entityId: id,
            before: toCategoryResponse(existing),
            after: toCategoryResponse(updated),
            metadata: { fields: Object.keys(updateData) },
        });

        return success(c, toCategoryResponse(updated), 'Category updated successfully');
    },

    delete: async (c: AppContext) => {
        const id = parseInt(c.req.param('id')!);
        const category = await categoriesQueries.findById(id);
        if (!category) throw new NotFoundError('Category', id);

        const childCount = await categoriesQueries.countChildren(id);
        if (childCount > 0) throw new ConflictError('Remove subcategories first');

        const count = await categoriesQueries.countProducts(id);
        if (count && count > 0) throw new ConflictError('Category has products');

        await categoriesQueries.delete(id);
        await auditFromContext(c, {
            action: 'CATEGORY_DELETED',
            entityType: 'category',
            entityId: id,
            before: toCategoryResponse(category),
        });
        return success(c, null, 'Category deleted successfully');
    },

    tree: async (c: AppContext) => {
        const all = await categoriesQueries.findAllFlat();
        const map = new Map<number, CategoryTreeNode>(
            all.map(cat => [Number(cat.id), { ...toCategoryResponse(cat), children: [] }])
        );
        const roots: CategoryTreeNode[] = [];
        for (const node of map.values()) {
            if (node.parent_id == null) {
                roots.push(node);
            } else {
                const parent = map.get(Number(node.parent_id));
                if (parent) parent.children.push(node);
            }
        }
        return success(c, roots);
    },
};
