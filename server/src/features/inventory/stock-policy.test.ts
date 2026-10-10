import { describe, expect, test } from 'bun:test';
import { stockCrossing } from './stock-policy';

describe('stockCrossing (threshold 5)', () => {
    test.each([
        [8, 5, 'low'],
        [6, 2, 'low'],
        [7, 0, 'out'],
        [3, 0, 'out'],
        [1, 0, 'out'],
    ])('%i → %i crosses: %s', (before, after, level) => {
        expect(stockCrossing(before, after, 5)).toBe(level as 'low' | 'out');
    });

    test.each([
        [9, 6, 'still above the threshold'],
        [4, 3, 'already low'],
        [5, 4, 'already at the threshold'],
        [0, 0, 'already out'],
        [2, 9, 'restock'],
        [0, 3, 'restock from empty'],
    ])('%i → %i: no alert (%s)', (before, after) => {
        expect(stockCrossing(before, after, 5)).toBeNull();
    });

    test('a threshold of 0 only alerts when stock runs out', () => {
        expect(stockCrossing(3, 1, 0)).toBeNull();
        expect(stockCrossing(1, 0, 0)).toBe('out');
    });
});
