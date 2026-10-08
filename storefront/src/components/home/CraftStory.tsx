import { Placeholder } from '@/components/product/Placeholder';

/** Editorial photo for the craftsmanship story. Set once you have one in `public/images/`. */
const CRAFT_IMAGE: string | null = '/images/our-promise.jpg';
const CRAFT_IMAGE_ALT = 'A burgundy Coach tote and Tabby bag on a shelf in the Bagstreet shop';

export function CraftStory() {
  return (
    <section className="bg-surface">
      <div className="max-w-[1440px] mx-auto grid items-center gap-10 px-4 py-16 sm:px-8 lg:grid-cols-12 lg:gap-8 lg:px-20 lg:py-28">
        <div className="aspect-[4/5] overflow-hidden lg:col-span-6">
          {CRAFT_IMAGE ? (
            <img
              src={CRAFT_IMAGE}
              alt={CRAFT_IMAGE_ALT}
              width={1440}
              height={1920}
              loading="lazy"
              decoding="async"
              // Keep the bags in frame when the 3:4 photo is cropped to the 4:5 panel.
              className="h-full w-full object-cover object-[50%_70%]"
            />
          ) : (
            <Placeholder seed="craft" label="Savoir-faire" className="h-full w-full" />
          )}
        </div>
        <div className="lg:col-span-4 lg:col-start-8">
          <p className="text-label-caps text-brass-text">Our Promise</p>
          <h2 className="mt-4 text-headline-lg">
            Chosen by hand, <em>meant to last</em>
          </h2>
          <p className="mt-6 text-[16px] leading-[1.7] font-light text-foreground-muted">
            Every piece at Bagstreet is selected for its leather, its stitching and the way it wears over time.
            We favour quiet craftsmanship over logos — pieces you'll reach for season after season.
          </p>
          <ul className="mt-10 grid grid-cols-1 gap-5 border-t border-border pt-8 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {[
              ['Authentic', 'Every piece verified'],
              ['Delivered', 'Countrywide shipping'],
              ['Secure', 'M-Pesa & card payments'],
            ].map(([title, body]) => (
              <li key={title}>
                <p className="text-[22px]" style={{ fontFamily: 'var(--font-display)' }}>{title}</p>
                <p className="mt-1 text-label-caps text-foreground-faint">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
