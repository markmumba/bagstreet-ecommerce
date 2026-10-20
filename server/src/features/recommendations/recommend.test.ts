import { describe, expect, test } from 'bun:test';
import {
    MIN_BOUGHT_TOGETHER, priceCloseness, recommendComplements, recommendForBag, recommendSimilar, type Candidate,
} from './recommend';

const BAGS = 1, TOTES = 11, CLUTCHES = 12, SCARVES = 2, SHOES = 3;
const make = (id: number, over: Partial<Candidate> = {}): Candidate => ({
    id, categoryId: TOTES, rootCategoryId: BAGS, price: 4000, inStock: true, colors: [], featured: false,
    ratingAverage: null, ratingCount: 0, ...over,
});
const ids = (list: Candidate[]) => list.map((c) => c.id);

describe('priceCloseness', () => {
    test('1 at the same price, 0 from ±60%', () => {
        expect(priceCloseness(4000, 4000)).toBe(1);
        expect(priceCloseness(4000, 5200)).toBeCloseTo(0.5);
        expect(priceCloseness(4000, 6400)).toBe(0);
        expect(priceCloseness(4000, 20000)).toBe(0);
        expect(priceCloseness(0, 100)).toBe(0);
    });
});

describe('recommendSimilar', () => {
    const target = make(1, { colors: ['black'] });

    test('same subcategory first, then the rest of the family; never other families, itself or sold out', () => {
        const result = recommendSimilar(target, [
            target,
            make(2, { categoryId: CLUTCHES }),
            make(3),
            make(4, { categoryId: SCARVES, rootCategoryId: SCARVES }),
            make(5, { inStock: false }),
        ]);
        expect(ids(result)).toEqual([3, 2]);
    });

    test('a similar price beats a far one', () => {
        expect(ids(recommendSimilar(target, [make(2, { price: 15000 }), make(3, { price: 4400 })]))).toEqual([3, 2]);
    });

    test('a shared colour helps', () => {
        expect(ids(recommendSimilar(target, [make(2, { colors: ['tan'] }), make(3, { colors: ['black', 'tan'] })]))).toEqual([3, 2]);
    });

    test('bought together counts only from the minimum number of orders', () => {
        const pieces = [make(2, { price: 4100 }), make(3, { price: 4600 })];
        expect(ids(recommendSimilar(target, pieces, new Map([[3, MIN_BOUGHT_TOGETHER - 1]])))).toEqual([2, 3]);
        expect(ids(recommendSimilar(target, pieces, new Map([[3, MIN_BOUGHT_TOGETHER]])))).toEqual([3, 2]);
    });

    test('ratings count only from 3 reviews', () => {
        const pieces = [make(2), make(3, { ratingAverage: 5, ratingCount: 2 }), make(4, { ratingAverage: 5, ratingCount: 3 })];
        expect(ids(recommendSimilar(target, pieces))[0]).toBe(4);
    });

    test('varies colours instead of repeating one', () => {
        const pieces = [
            make(2, { colors: ['brown'], price: 4000 }), make(3, { colors: ['brown'], price: 4010 }),
            make(4, { colors: ['brown'], price: 4020 }), make(5, { colors: ['red'], price: 4400 }),
        ];
        expect(ids(recommendSimilar(target, pieces, new Map(), { limit: 2 }))).toEqual([2, 5]);
    });

    test('respects the limit and exclusions', () => {
        const pieces = Array.from({ length: 12 }, (_, i) => make(i + 2));
        expect(recommendSimilar(target, pieces)).toHaveLength(8);
        expect(ids(recommendSimilar(target, pieces, new Map(), { exclude: new Set([2]) }))).not.toContain(2);
    });
});

describe('recommendComplements', () => {
    const target = make(1);
    const scarf = make(10, { categoryId: SCARVES, rootCategoryId: SCARVES, price: 2000 });
    const shoe = make(20, { categoryId: SHOES, rootCategoryId: SHOES, price: 4000 });
    const tote = make(30);

    test('staff picks come first, in their order, skipping sold-out ones', () => {
        const soldOut = make(40, { categoryId: SHOES, rootCategoryId: SHOES, inStock: false });
        const result = recommendComplements(target, [scarf, shoe, soldOut], { staffPicks: [40, 20], pairedCategoryIds: [SCARVES] });
        expect(ids(result)).toEqual([20, 10]);
    });

    test('a staff pick may be from the same category', () => {
        expect(ids(recommendComplements(target, [tote], { staffPicks: [30] }))).toEqual([30]);
    });

    test('without picks: only paired categories, never its own family', () => {
        expect(ids(recommendComplements(target, [scarf, shoe, tote], { pairedCategoryIds: [SCARVES] }))).toEqual([10]);
    });

    test('a subcategory of a paired category counts', () => {
        const silk = make(11, { categoryId: 21, rootCategoryId: SCARVES });
        expect(ids(recommendComplements(target, [silk], { pairedCategoryIds: [SCARVES] }))).toEqual([11]);
    });

    test('things often bought with it join even from unpaired categories', () => {
        const result = recommendComplements(target, [scarf, shoe], { pairedCategoryIds: [SCARVES], together: new Map([[20, 5]]) });
        expect(ids(result).sort()).toEqual([10, 20]);
    });

    test('nothing paired and nothing bought together → empty', () => {
        expect(recommendComplements(target, [scarf, shoe], {})).toEqual([]);
    });
});

describe('recommendForBag', () => {
    const tote = make(1);
    const scarf = make(10, { categoryId: SCARVES, rootCategoryId: SCARVES });
    const shoe = make(20, { categoryId: SHOES, rootCategoryId: SHOES });
    const otherBag = make(30, { featured: true });

    test('suggests what goes with the bag, never what is in it', () => {
        const result = recommendForBag([tote, scarf], [tote, scarf, shoe, otherBag], {
            pairedCategoryIds: new Map([[BAGS, [SCARVES, SHOES]], [SCARVES, [BAGS]]]),
            limit: 2,
        });
        expect(ids(result)).toEqual([20, 30]);
    });

    test('fills with featured and well-rated pieces when nothing pairs', () => {
        const rated = make(40, { categoryId: SHOES, rootCategoryId: SHOES, ratingAverage: 5, ratingCount: 4 });
        expect(ids(recommendForBag([tote], [tote, otherBag, rated, make(50)], { limit: 2 }))).toEqual([40, 30]);
    });

    test('an empty bag gets the fill', () => {
        expect(ids(recommendForBag([], [otherBag, make(50)], { limit: 1 }))).toEqual([30]);
    });
});
