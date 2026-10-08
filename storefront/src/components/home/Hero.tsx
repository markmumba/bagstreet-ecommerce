import { Link } from '@tanstack/react-router';
import { Placeholder } from '@/components/product/Placeholder';
import { useStorefrontHero } from '@/hooks/useStorefrontHero';

/** Full-bleed campaign hero. Image and copy are managed by the owner in Admin → Settings. */
export function Hero() {
  const { data, isLoading } = useStorefrontHero();
  const hero = data?.data;

  // Headline lines: everything but the last is upright, the last is set in italics.
  const lines = (hero?.title ?? '').split('\n').filter(Boolean);
  const lead = lines.slice(0, -1);
  const italic = lines[lines.length - 1];

  return (
    <section className="relative h-[92svh] min-h-[560px] overflow-hidden bg-espresso text-background">
      {hero?.image_url ? (
        <picture>
          {hero.image_url_small && <source media="(max-width: 767px)" srcSet={hero.image_url_small} />}
          <img
            src={hero.image_url}
            alt=""
            fetchPriority="high"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </picture>
      ) : (
        !isLoading && <Placeholder seed="hero" tone="dark" className="absolute inset-0" />
      )}
      {/* Legibility scrim for the transparent nav and the copy */}
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(28,23,20,0.45)_0%,transparent_24%,transparent_40%,rgba(28,23,20,0.72)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(28,23,20,0.35)_0%,transparent_55%)]" />

      {hero && (
        <div className="relative max-w-[1440px] mx-auto flex h-full items-end px-4 pb-16 sm:px-8 lg:px-20 lg:pb-24">
          <div className="max-w-2xl">
            {hero.eyebrow && <p className="text-label-caps text-background/85">{hero.eyebrow}</p>}
            <h1 className="mt-5 text-display">
              {lead.map((line) => (
                <span key={line} className="block">{line}</span>
              ))}
              {italic && <em className="block">{italic}</em>}
            </h1>
            {hero.subtitle && (
              <p className="mt-5 max-w-md text-[16px] leading-7 font-light text-background/90">{hero.subtitle}</p>
            )}
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                to="/shop"
                className="ui-press inline-flex h-[52px] items-center bg-background px-8 text-label-caps text-foreground hover:bg-surface"
              >
                Discover the collection
              </Link>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
