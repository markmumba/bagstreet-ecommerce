const STAR_PATH = 'M12 2.5l2.94 6.08 6.56.9-4.78 4.6 1.17 6.62L12 17.56 6.11 20.7l1.17-6.62-4.78-4.6 6.56-.9z';

/** Five stars, filled to `rating` (fractions allowed). Purely visual: pair it with text for screen readers. */
export function Stars({ rating, size = 14, className = '' }: { rating: number; size?: number; className?: string }) {
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center gap-[2px] ${className}`}>
      {Array.from({ length: 5 }, (_, i) => {
        const fill = Math.max(0, Math.min(1, rating - i));
        return <Star key={i} fill={fill} size={size} />;
      })}
    </span>
  );
}

function Star({ fill, size }: { fill: number; size: number }) {
  return (
    <span className="relative inline-block" style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" width={size} height={size} className="absolute inset-0 text-stone">
        <path d={STAR_PATH} fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinejoin="round" />
      </svg>
      {fill > 0 && (
        <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
          <svg viewBox="0 0 24 24" width={size} height={size} className="text-brass">
            <path d={STAR_PATH} fill="currentColor" stroke="currentColor" strokeWidth={1.2} strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </span>
  );
}

export function ratingLabel(average: number, count?: number) {
  const stars = `${Number.isInteger(average) ? average : average.toFixed(1)} out of 5 stars`;
  if (count === undefined) return stars;
  return `${stars}, ${count} ${count === 1 ? 'review' : 'reviews'}`;
}

export function formatReviewDate(date: string) {
  return new Date(date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}
