import { describe, expect, test } from 'bun:test';
import { catalogPagination, catalogQuerySchema } from './catalog.schema';

describe('catalog query validation', () => {
    test('defaults to 24 products and newest first', () => {
        expect(catalogQuerySchema.parse({})).toEqual({ page: 1, limit: 24, search: '', sort: 'newest' });
    });

    test('parses pagination and trims a category search', () => {
        expect(catalogQuerySchema.parse({ page: '2', search: '  Coach  ', categorySlug: 'bags', sort: 'price_asc' }))
            .toEqual({ page: 2, limit: 24, search: 'Coach', categorySlug: 'bags', sort: 'price_asc' });
    });

    test('rejects invalid pages and page sizes', () => {
        for (const page of ['0', '-1', '1.5', '2x', '1000001']) {
            expect(catalogQuerySchema.safeParse({ page }).success).toBe(false);
        }
        for (const limit of ['0', '49', '24x', '2.5']) {
            expect(catalogQuerySchema.safeParse({ limit }).success).toBe(false);
        }
    });

    test('rejects arbitrary sort expressions and excessive search terms', () => {
        expect(catalogQuerySchema.safeParse({ sort: 'price; DROP TABLE products' }).success).toBe(false);
        expect(catalogQuerySchema.safeParse({ search: 'x'.repeat(201) }).success).toBe(false);
        expect(catalogQuerySchema.safeParse({ categoryId: 'abc' }).success).toBe(false);
    });
});

describe('catalog pagination', () => {
    test('rounds up to include the last product', () => {
        expect(catalogPagination(2, 24, 49)).toEqual({ page: 2, limit: 24, total: 49, total_pages: 3 });
    });

    test('clamps a stale bookmarked page after stock is removed', () => {
        expect(catalogPagination(99, 24, 25).page).toBe(2);
    });

    test('keeps empty results on page one', () => {
        expect(catalogPagination(5, 24, 0)).toEqual({ page: 1, limit: 24, total: 0, total_pages: 1 });
    });
});
