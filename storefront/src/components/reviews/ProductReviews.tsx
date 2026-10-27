import type { PublicReviewResponse, ReviewSummaryResponse } from 'shared';
import { formatReviewDate, ratingLabel, Stars } from './Stars';

interface ProductReviewsProps {
  summary: ReviewSummaryResponse | undefined;
  reviews: PublicReviewResponse[];
  isLoading: boolean;
  isError: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  onShowMore: () => void;
}

export function ProductReviews({ summary, reviews, isLoading, isError, hasMore, isLoadingMore, onShowMore }: ProductReviewsProps) {
  const count = summary?.count ?? 0;

  return (
    <section aria-labelledby="reviews-heading" className="max-w-[1440px] mx-auto px-4 py-16 sm:px-8 lg:px-20 lg:py-20">
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-4">
          <p className="text-label-caps text-brass-text">From our customers</p>
          <h2 id="reviews-heading" className="mt-3 scroll-mt-28 text-headline-md">Reviews</h2>

          {isLoading ? (
            <div className="mt-6 h-24 animate-pulse bg-surface" aria-hidden="true" />
          ) : isError ? (
            <p className="mt-6 text-[14px] text-foreground-muted" role="alert">
              Reviews couldn’t be loaded. Refresh the page to try again.
            </p>
          ) : count > 0 && summary?.average != null ? (
            <>
              <div className="mt-6 flex items-center gap-4">
                <span className="text-[44px] leading-none tabular-nums" style={{ fontFamily: 'var(--font-display)' }} aria-hidden="true">
                  {summary.average.toFixed(1)}
                </span>
                <div>
                  <Stars rating={summary.average} size={16} />
                  <p className="mt-1.5 text-[13px] text-foreground-muted" aria-hidden="true">
                    {count} {count === 1 ? 'review' : 'reviews'}
                  </p>
                  <p className="sr-only">{ratingLabel(summary.average, count)}</p>
                </div>
              </div>

              <ul className="mt-8 space-y-2.5" aria-label="Rating breakdown">
                {(['5', '4', '3', '2', '1'] as const).map((star) => {
                  const n = summary.distribution[star] ?? 0;
                  const pct = count ? Math.round((n / count) * 100) : 0;
                  return (
                    <li key={star} className="grid grid-cols-[3.5rem_1fr_2rem] items-center gap-3 text-[13px] text-foreground-muted">
                      <span className="sr-only">{star} {star === '1' ? 'star' : 'stars'}: {n} {n === 1 ? 'review' : 'reviews'}</span>
                      <span aria-hidden="true">{star} {star === '1' ? 'star' : 'stars'}</span>
                      <span aria-hidden="true" className="h-[3px] bg-surface-oat">
                        <span className="block h-full bg-brass" style={{ width: `${pct}%` }} />
                      </span>
                      <span aria-hidden="true" className="text-right tabular-nums">{n}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="mt-6 text-[15px] leading-relaxed text-foreground-muted">
              No reviews yet. Bought this? You can review it from your order.
            </p>
          )}
        </div>

        {reviews.length > 0 && (
          <div className="lg:col-span-7 lg:col-start-6">
            <ol className="divide-y divide-border border-y border-border">
              {reviews.map((review) => <ReviewItem key={review.id} review={review} />)}
            </ol>
            {hasMore && (
              <button
                type="button"
                onClick={onShowMore}
                disabled={isLoadingMore}
                className="ui-press mt-8 h-[48px] w-full border border-espresso px-8 text-label-caps hover:bg-espresso hover:text-background disabled:cursor-wait disabled:opacity-60 sm:w-auto"
              >
                {isLoadingMore ? 'Loading…' : 'Show more reviews'}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function ReviewItem({ review }: { review: PublicReviewResponse }) {
  return (
    <li className="py-8">
      <article>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <span className="flex items-center gap-2">
            <Stars rating={review.rating} />
            <span className="sr-only">{ratingLabel(review.rating)}</span>
          </span>
          <time dateTime={review.created_at} className="text-[12px] text-foreground-faint">
            {formatReviewDate(review.created_at)}
          </time>
        </div>
        {review.title && (
          <h3 className="mt-4 text-[21px] leading-snug" style={{ fontFamily: 'var(--font-display)' }}>{review.title}</h3>
        )}
        <p className={`${review.title ? 'mt-2' : 'mt-4'} whitespace-pre-line break-words text-[15px] leading-[1.7] text-foreground-muted`}>
          {review.body}
        </p>
        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          <span className="text-foreground">{review.author_name}</span>
          <span className="text-label-caps text-olive">Verified buyer</span>
          {review.variant_label && <span className="text-foreground-faint">Bought: {review.variant_label}</span>}
        </p>
        {review.reply && (
          <div className="mt-5 border-l border-brass bg-surface px-5 py-4">
            <p className="text-label-caps text-brass-text">Reply from Bagstreet</p>
            <p className="mt-2 whitespace-pre-line break-words text-[14px] leading-relaxed text-foreground-muted">{review.reply.body}</p>
          </div>
        )}
      </article>
    </li>
  );
}
