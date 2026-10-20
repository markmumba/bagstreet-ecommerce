/**
 * Products this browser looked at, most recent first. Kept in localStorage only: it never leaves
 * the device. Every access is guarded so private mode or blocked storage just means "no history".
 */
const STORAGE_KEY = 'bagstreet_recently_viewed';
export const RECENTLY_VIEWED_MAX = 12;

export function readRecentlyViewed(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const ids = parsed.map(String).filter((id) => /^\d+$/.test(id));
    return [...new Set(ids)].slice(0, RECENTLY_VIEWED_MAX);
  } catch {
    return [];
  }
}

export function recordRecentlyViewed(productId: string | number): void {
  const id = String(productId);
  if (!/^\d+$/.test(id)) return;
  try {
    const next = [id, ...readRecentlyViewed().filter((existing) => existing !== id)].slice(0, RECENTLY_VIEWED_MAX);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable or full: the rail just stays empty.
  }
}
