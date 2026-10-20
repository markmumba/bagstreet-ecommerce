/**
 * Which products to suggest, and in what order (CONTEXT.md › Recommendations). Pure: the caller
 * loads the catalogue, staff picks, category pairings and bought-together counts; nothing here
 * touches the database, so every rule is unit-tested.
 *
 * - Similar ("You may also like"): same category family, similar price, shared colours.
 * - Complete the look: staff picks first, then products from the categories paired with this one.
 * - Bag: what goes with everything in the bag, never what's already in it.
 * Bought-together counts only count once a pair has been bought together in enough orders, so a
 * single odd order can't steer the shop.
 */

export interface Candidate {
    id: number;
    categoryId: number;
    /** The top-level category (the category itself when it has no parent). */
    rootCategoryId: number;
    /** What the customer pays now (sale price while a sale runs). */
    price: number;
    inStock: boolean;
    /** Lower-cased variant colours. */
    colors: string[];
    featured: boolean;
    ratingAverage: number | null;
    ratingCount: number;
}

/** Orders a pair must appear in together before it counts. */
export const MIN_BOUGHT_TOGETHER = 3;
/** Prices further apart than this (as a share of the product's price) earn no similarity. */
const PRICE_WINDOW = 0.6;
export const RAIL_LIMIT = 8;
export const COMPLETE_THE_LOOK_LIMIT = 4;
export const MAX_STAFF_PICKS = 4;

/** Bought-together counts for one product: other product id → orders containing both. */
export type TogetherCounts = ReadonlyMap<number, number>;

/** 1 for the same price, falling to 0 at ±60%. */
export function priceCloseness(target: number, other: number): number {
    if (target <= 0 || other <= 0) return 0;
    return Math.max(0, 1 - Math.abs(other - target) / target / PRICE_WINDOW);
}

function togetherBoost(count: number | undefined): number {
    if (!count || count < MIN_BOUGHT_TOGETHER) return 0;
    return Math.min(30, 10 + 4 * (count - MIN_BOUGHT_TOGETHER));
}

function qualityBoost(c: Candidate): number {
    const rating = c.ratingCount >= 3 && c.ratingAverage != null ? (c.ratingAverage - 3) * 2 : 0;
    return rating + (c.featured ? 3 : 0);
}

const sharesColor = (a: Candidate, b: Candidate) => a.colors.some((color) => b.colors.includes(color));

/**
 * Takes the best `limit` by score, with a small penalty for repeating a colour already picked, so
 * the rail isn't eight near-identical pieces. Ties keep catalogue order (stable).
 */
function pickVaried(scored: { c: Candidate; score: number }[], limit: number): Candidate[] {
    const pool = [...scored].sort((a, b) => b.score - a.score);
    const picked: Candidate[] = [];
    while (picked.length < limit && pool.length > 0) {
        let bestIndex = 0;
        let bestScore = -Infinity;
        pool.forEach((entry, index) => {
            const repeats = picked.filter((p) => sharesColor(p, entry.c)).length;
            const score = entry.score - 4 * repeats;
            if (score > bestScore) { bestScore = score; bestIndex = index; }
        });
        picked.push(pool.splice(bestIndex, 1)[0]!.c);
    }
    return picked;
}

/** "You may also like": other pieces from the same category family. */
export function recommendSimilar(
    target: Candidate,
    candidates: readonly Candidate[],
    together: TogetherCounts = new Map(),
    options: { limit?: number; exclude?: ReadonlySet<number> } = {},
): Candidate[] {
    const scored = candidates
        .filter((c) => c.id !== target.id && c.inStock && !options.exclude?.has(c.id) && c.rootCategoryId === target.rootCategoryId)
        .map((c) => ({
            c,
            score: (c.categoryId === target.categoryId ? 40 : 20)
                + 20 * priceCloseness(target.price, c.price)
                + (sharesColor(target, c) ? 10 : 0)
                + togetherBoost(together.get(c.id))
                + qualityBoost(c),
        }));
    return pickVaried(scored, options.limit ?? RAIL_LIMIT);
}

/** "Complete the look": staff picks first, then the paired categories, then what's bought with it. */
export function recommendComplements(
    target: Candidate,
    candidates: readonly Candidate[],
    input: { staffPicks?: readonly number[]; pairedCategoryIds?: readonly number[]; together?: TogetherCounts; limit?: number },
): Candidate[] {
    const limit = input.limit ?? COMPLETE_THE_LOOK_LIMIT;
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const picks = (input.staffPicks ?? [])
        .map((id) => byId.get(id))
        .filter((c): c is Candidate => c != null && c.inStock && c.id !== target.id)
        .slice(0, limit);
    if (picks.length >= limit) return picks;

    const paired = new Set(input.pairedCategoryIds ?? []);
    const together = input.together ?? new Map();
    const taken = new Set(picks.map((p) => p.id));
    const scored = candidates
        .filter((c) => c.id !== target.id && c.inStock && !taken.has(c.id) && c.rootCategoryId !== target.rootCategoryId)
        .map((c) => {
            const inPairedCategory = paired.has(c.categoryId) || paired.has(c.rootCategoryId);
            const boughtWith = togetherBoost(together.get(c.id));
            if (!inPairedCategory && boughtWith === 0) return null;
            return { c, score: (inPairedCategory ? 30 : 0) + boughtWith + 10 * priceCloseness(target.price, c.price) + qualityBoost(c) };
        })
        .filter((entry): entry is { c: Candidate; score: number } => entry != null);
    return [...picks, ...pickVaried(scored, limit - picks.length)];
}

/**
 * For the bag: what goes with the pieces in it. Each candidate keeps its best match across the bag;
 * when nothing pairs (or the bag is empty of known products), featured and well-rated pieces fill in.
 */
export function recommendForBag(
    bag: readonly Candidate[],
    candidates: readonly Candidate[],
    input: { staffPicks?: ReadonlyMap<number, readonly number[]>; pairedCategoryIds?: ReadonlyMap<number, readonly number[]>; together?: ReadonlyMap<number, TogetherCounts>; limit?: number },
): Candidate[] {
    const limit = input.limit ?? COMPLETE_THE_LOOK_LIMIT;
    const inBag = new Set(bag.map((b) => b.id));
    const best = new Map<number, { c: Candidate; score: number }>();
    for (const item of bag) {
        const ranked = recommendComplements(item, candidates.filter((c) => !inBag.has(c.id)), {
            staffPicks: input.staffPicks?.get(item.id),
            pairedCategoryIds: input.pairedCategoryIds?.get(item.categoryId) ?? input.pairedCategoryIds?.get(item.rootCategoryId),
            together: input.together?.get(item.id),
            limit: candidates.length,
        });
        // Earlier in a ranking is better; the first bag item to rank a piece highest wins ties.
        ranked.forEach((c, index) => {
            const score = ranked.length - index;
            if ((best.get(c.id)?.score ?? -Infinity) < score) best.set(c.id, { c, score });
        });
    }
    const chosen = pickVaried([...best.values()], limit);
    if (chosen.length >= limit) return chosen;

    const taken = new Set(chosen.map((c) => c.id));
    const fill = candidates
        .filter((c) => c.inStock && !inBag.has(c.id) && !taken.has(c.id))
        .map((c) => ({ c, score: qualityBoost(c) }));
    return [...chosen, ...pickVaried(fill, limit - chosen.length)];
}
