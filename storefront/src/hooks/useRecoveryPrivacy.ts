import { useEffect } from 'react';

/** Keep capability links out of search results and image/link referrers. */
export function useRecoveryPrivacy() {
  useEffect(() => {
    const metas = ['robots', 'referrer'].map((name, index) => {
      const existing = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
      const meta = existing ?? document.createElement('meta');
      const previous = existing?.content;
      meta.name = name;
      meta.content = index === 0 ? 'noindex, nofollow' : 'no-referrer';
      if (!existing) document.head.appendChild(meta);
      return { meta, previous };
    });
    return () => metas.forEach(({ meta, previous }) => {
      if (previous === undefined) meta.remove();
      else meta.content = previous;
    });
  }, []);
}
