import { z } from 'zod';
import { STOREFRONT_SORTS, type CategoryTreeNode } from 'shared';

export const catalogSearchSchema = z.object({
  search: z.string().trim().max(200).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1_000_000).optional().catch(undefined),
  sort: z.enum(STOREFRONT_SORTS).optional().catch(undefined),
  category: z.coerce.number().int().positive().optional().catch(undefined),
});

export type CatalogSearch = z.infer<typeof catalogSearchSchema>;

export function categoryPath(tree: CategoryTreeNode[], id: string): CategoryTreeNode[] {
  for (const node of tree) {
    if (node.id === id) return [node];
    const descendants = categoryPath(node.children, id);
    if (descendants.length) return [node, ...descendants];
  }
  return [];
}

export function paginationPages(page: number, total: number): number[] {
  const start = Math.max(1, Math.min(page - 2, total - 4));
  return Array.from({ length: Math.min(5, total) }, (_, index) => start + index);
}
