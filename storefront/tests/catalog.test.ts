import { describe, expect, test } from 'bun:test';
import type { CategoryTreeNode } from 'shared';
import { catalogSearchSchema, categoryPath, paginationPages } from '../src/lib/catalog';

function category(id: string, children: CategoryTreeNode[] = []): CategoryTreeNode {
  return {
    id,
    name: id,
    slug: id,
    description: '',
    parent_id: null,
    children_count: children.length,
    children,
    created_at: '',
    updated_at: '',
  };
}

describe('catalog URL state', () => {
  test('accepts a bookmark with search, page and sort', () => {
    expect(catalogSearchSchema.parse({ search: ' coach ', page: '2', sort: 'price_asc' })).toEqual({
      search: 'coach',
      page: 2,
      sort: 'price_asc',
    });
  });

  test('falls back safely for malformed bookmarks', () => {
    expect(catalogSearchSchema.parse({ page: '-1', sort: 'unknown', category: 'text' })).toEqual({
      page: undefined,
      sort: undefined,
      category: undefined,
    });
  });
});

describe('category breadcrumbs', () => {
  const tree = [category('bags', [category('totes', [category('leather')])]), category('scarves')];

  test('supports nested collections at any depth', () => {
    expect(categoryPath(tree, 'leather').map((node) => node.slug)).toEqual([
      'bags',
      'totes',
      'leather',
    ]);
    expect(categoryPath(tree, 'scarves').map((node) => node.slug)).toEqual(['scarves']);
  });

  test('ignores a category that is not in the tree', () => {
    expect(categoryPath(tree, 'missing')).toEqual([]);
  });
});

describe('compact pagination', () => {
  test('shows all pages for small collections', () => {
    expect(paginationPages(1, 1)).toEqual([1]);
    expect(paginationPages(2, 3)).toEqual([1, 2, 3]);
  });

  test('keeps five valid pages at the beginning, middle and end', () => {
    expect(paginationPages(1, 10)).toEqual([1, 2, 3, 4, 5]);
    expect(paginationPages(6, 10)).toEqual([4, 5, 6, 7, 8]);
    expect(paginationPages(10, 10)).toEqual([6, 7, 8, 9, 10]);
  });
});
