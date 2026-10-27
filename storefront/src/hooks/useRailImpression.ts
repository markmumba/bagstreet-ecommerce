import { useEffect, useRef, type RefObject } from 'react';
import { useRouterState } from '@tanstack/react-router';
import type { RecommendationRail } from 'shared';
import { trackRecommendation } from '@/hooks/useRecommendations';

/**
 * Counts one impression per rail per page view, once at least 30% of the rail is on screen.
 * Does nothing without a rail name, while the rail is empty, or where IntersectionObserver is missing.
 */
export function useRailImpression(
  ref: RefObject<HTMLElement | null>,
  rail: RecommendationRail | undefined,
  ready: boolean,
) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const sentFor = useRef<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!rail || !ready || !el || sentFor.current === pathname) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && sentFor.current !== pathname) {
          sentFor.current = pathname;
          trackRecommendation(rail, 'impression');
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, rail, ready, pathname]);
}
