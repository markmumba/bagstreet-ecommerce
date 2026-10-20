import { useEffect, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';

type ParamValue = string | number | undefined;

/**
 * A list page's filters, search and page, kept in the URL so refresh, Back and shared links keep
 * them. `q` is the search text: the box updates instantly and the URL (and the query) follow
 * once typing pauses. Changing anything but the page goes back to page 1.
 */
export function useListParams<T extends Record<string, ParamValue>>(defaults: T) {
  const raw = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();
  const params = { ...defaults } as T & { q?: string; page?: number };
  for (const key of Object.keys(raw)) {
    const value = raw[key];
    if (typeof value === 'string' || typeof value === 'number') (params as Record<string, ParamValue>)[key] = value;
  }
  const page = Math.max(1, Number(params.page) || 1);

  const update = (patch: Partial<T & { q?: string; page?: number }>) => {
    const resetsPage = Object.keys(patch).some((key) => key !== 'page');
    navigate({
      to: '.',
      replace: true,
      search: (prev: Record<string, unknown>) => {
        const next: Record<string, unknown> = { ...prev, ...patch };
        if (resetsPage && !('page' in patch)) delete next.page;
        for (const [key, value] of Object.entries(next)) {
          // Defaults and empty values stay out of the URL.
          if (value === '' || value === undefined || value === (defaults as Record<string, ParamValue>)[key] || (key === 'page' && value === 1)) {
            delete next[key];
          }
        }
        return next;
      },
    } as never);
  };

  const committed = String(params.q ?? '');
  const [searchText, setSearchText] = useState(committed);
  useEffect(() => setSearchText(committed), [committed]);
  useEffect(() => {
    if (searchText === committed) return;
    const timer = window.setTimeout(() => update({ q: searchText } as never), 350);
    return () => window.clearTimeout(timer);
  }, [searchText]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    params,
    page,
    /** The search text as committed to the URL (what to query with). */
    query: committed,
    searchText,
    setSearchText,
    setPage: (next: number | ((current: number) => number)) =>
      update({ page: typeof next === 'function' ? next(page) : next } as never),
    update,
  };
}
