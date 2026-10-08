import { describe, expect, test } from 'bun:test';
import { readJsonColumn, toJsonbParam } from './json-column';

describe('toJsonbParam', () => {
    test('passes objects and arrays through untouched', () => {
        const value = { a: 1, nested: { b: 'x' } };
        expect(toJsonbParam(value)).toBe(value);
        expect(toJsonbParam([1, 2])).toEqual([1, 2]);
    });

    test('maps null and undefined to SQL NULL', () => {
        expect(toJsonbParam(null)).toBeNull();
        expect(toJsonbParam(undefined)).toBeNull();
    });

    test('parses pre-serialised JSON so it is not double-encoded', () => {
        expect(toJsonbParam('{"a":1}')).toEqual({ a: 1 });
        expect(toJsonbParam('not json')).toBe('not json');
    });
});

describe('readJsonColumn', () => {
    test('reads objects and legacy double-encoded strings', () => {
        expect(readJsonColumn({ a: 1 })).toEqual({ a: 1 });
        expect(readJsonColumn('{"a":1}')).toEqual({ a: 1 });
        expect(readJsonColumn(null)).toBeNull();
        expect(readJsonColumn('not json')).toBeNull();
    });
});
