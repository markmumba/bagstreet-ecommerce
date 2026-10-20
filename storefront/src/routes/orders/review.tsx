import { createFileRoute, Link } from '@tanstack/react-router';
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { z } from 'zod';
import { REVIEW_STATUS, type OrderReviewItem } from 'shared';
import { useDeleteReview, useOrderReviews, useUpsertReview } from '@/hooks/useReviews';
import { useSeo } from '@/hooks/useSeo';
import { ratingLabel, Stars } from '@/components/reviews/Stars';

export const Route = createFileRoute('/orders/review')({
  validateSearch: z.object({
    order_id: z.string().catch(''),
    token: z.string().optional().catch(undefined),
  }),
  component: OrderReviewPage,
});

const inputClass =
  'w-full border-0 border-b border-stone bg-transparent px-0 py-2 text-[15px] font-light text-foreground placeholder:text-foreground-faint focus:border-foreground focus:outline-none focus:ring-0 transition-colors duration-200';

const BODY_MIN = 10;
const BODY_MAX = 2000;
const TITLE_MAX = 100;

function OrderReviewPage() {
  const { order_id, token } = Route.useSearch();
  const query = useOrderReviews(order_id || undefined, token);
  const data = query.data?.data;

  useSeo({
    title: 'Review your order',
    description: 'Tell other customers about the pieces you bought from Bagstreet.',
    canonicalPath: '/orders/review',
  });

  const status = (query.error as { status?: number } | null)?.status;
  const linkRejected = !order_id || status === 401 || status === 403 || status === 404;
  const next = `/orders/review?order_id=${encodeURIComponent(order_id)}`;

  return (
    <div className="max-w-[960px] mx-auto px-4 pt-[104px] pb-24 sm:px-8 lg:pt-32">
      {query.isLoading ? (
        <div aria-busy="true" aria-label="Loading your order">
          <div className="h-3 w-24 animate-pulse bg-surface" />
          <div className="mt-4 h-10 w-2/3 animate-pulse bg-surface" />
          <div className="mt-12 h-64 animate-pulse bg-surface" />
        </div>
      ) : query.isError ? (
        <div className="py-12 text-center">
          <p className="text-label-caps text-foreground-faint">Reviews</p>
          <h1 className="mt-4 text-headline-lg">We couldn’t open this <em>review link</em></h1>
          <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-foreground-muted" role="alert">
            {linkRejected
              ? 'This review link has expired or isn’t yours. Sign in to review from your orders.'
              : `${query.error?.message || 'Something went wrong.'} Refresh the page to try again.`}
          </p>
          {linkRejected && (
            <Link
              to="/login"
              search={{ next }}
              className="ui-press mt-9 inline-flex h-[52px] items-center bg-espresso px-8 text-label-caps text-background hover:bg-espresso-hover"
            >
              Sign in
            </Link>
          )}
        </div>
      ) : data ? (
        <>
          <header className="border-b border-border pb-8">
            <p className="text-label-caps text-brass-text">Verified buyer</p>
            <h1 className="mt-4 text-headline-lg">Review your order <em>{data.order_number}</em></h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-foreground-muted">
              Tell other customers how your pieces turned out. We check each review before it appears on the shop.
            </p>
          </header>

          {!data.can_review ? (
            <p className="mt-10 border border-border-subtle bg-surface px-5 py-4 text-[15px] text-foreground-muted" role="status">
              {data.reason || 'This order can’t be reviewed yet.'}
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {data.items.map((item) => (
                <li key={item.product_id}>
                  <ReviewCard item={item} orderRef={order_id} token={token} />
                </li>
              ))}
            </ul>
          )}

          <p className="mt-12 text-[13px] text-foreground-muted">
            <Link to="/shop" className="underline decoration-[0.5px] underline-offset-4 hover:text-brass-text">Continue shopping</Link>
          </p>
        </>
      ) : null}
    </div>
  );
}

const STATUS_TEXT: Record<string, string> = {
  [REVIEW_STATUS.PENDING]: 'Waiting for approval',
  [REVIEW_STATUS.APPROVED]: 'Published',
  [REVIEW_STATUS.REJECTED]: 'Not published',
};

function ReviewCard({ item, orderRef, token }: { item: OrderReviewItem; orderRef: string; token?: string }) {
  const existing = item.review;
  const [editing, setEditing] = useState(!existing);
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [body, setBody] = useState(existing?.body ?? '');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const upsert = useUpsertReview(orderRef);
  const remove = useDeleteReview(orderRef);
  const ids = useId();

  const startEditing = () => {
    setRating(existing?.rating ?? 0);
    setTitle(existing?.title ?? '');
    setBody(existing?.body ?? '');
    setError('');
    setNotice('');
    setEditing(true);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (rating < 1) return setError('Choose a star rating from 1 to 5.');
    if (body.trim().length < BODY_MIN) return setError(`Write at least ${BODY_MIN} characters in your review.`);
    try {
      const res = await upsert.mutateAsync({
        productId: item.product_id,
        order_ref: orderRef,
        token,
        rating,
        title: title.trim() || undefined,
        body: body.trim(),
      });
      setNotice(res.message || 'Thanks! Your review will appear once we’ve checked it.');
      setEditing(false);
    } catch (err: any) {
      setError(`${err?.message || 'Your review couldn’t be saved.'} Check it and try again.`);
    }
  };

  const confirmDelete = async () => {
    setError('');
    setNotice('');
    try {
      await remove.mutateAsync({ productId: item.product_id, order_ref: orderRef, token });
      setConfirmingDelete(false);
      setRating(0);
      setTitle('');
      setBody('');
      setEditing(true);
      setNotice('Your review has been deleted.');
    } catch (err: any) {
      setError(`${err?.message || 'Your review couldn’t be deleted.'} Try again in a moment.`);
    }
  };

  const bodyLength = body.trim().length;

  return (
    <article className="grid gap-6 py-10 sm:grid-cols-[120px_1fr] sm:gap-8" aria-labelledby={`${ids}-name`}>
      <div className="flex gap-4 sm:block">
        <div className="aspect-[4/5] w-24 shrink-0 overflow-hidden bg-surface sm:w-full">
          {item.image_url && <img src={item.image_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}
        </div>
        <div className="min-w-0 sm:hidden">
          <ProductHeading item={item} id={`${ids}-name`} />
        </div>
      </div>

      <div className="min-w-0">
        <div className="hidden sm:block">
          <ProductHeading item={item} id={`${ids}-name-wide`} />
        </div>

        {existing && !editing ? (
          <div className="mt-6">
            <p className="text-[13px]">
              <span className={`text-label-caps ${existing.status === REVIEW_STATUS.APPROVED ? 'text-olive' : existing.status === REVIEW_STATUS.REJECTED ? 'text-destructive' : 'text-brass-text'}`}>
                {STATUS_TEXT[existing.status] ?? existing.status}
              </span>
              {existing.status === REVIEW_STATUS.REJECTED && existing.reject_reason && (
                <span className="text-foreground-muted">: {existing.reject_reason}</span>
              )}
            </p>
            <div className="mt-4 flex items-center gap-2">
              <Stars rating={existing.rating} />
              <span className="sr-only">{ratingLabel(existing.rating)}</span>
            </div>
            {existing.title && <h3 className="mt-3 text-[21px] leading-snug" style={{ fontFamily: 'var(--font-display)' }}>{existing.title}</h3>}
            <p className="mt-2 whitespace-pre-line break-words text-[15px] leading-[1.7] text-foreground-muted">{existing.body}</p>

            {confirmingDelete ? (
              <div className="mt-6 border border-border-subtle bg-surface p-4" role="group" aria-label="Confirm delete">
                <p className="text-[14px]">Delete your review of {item.product_name}? This can’t be undone.</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button type="button" onClick={confirmDelete} disabled={remove.isPending}
                    className="ui-press h-10 bg-espresso px-5 text-label-caps text-background hover:bg-espresso-hover disabled:opacity-60">
                    {remove.isPending ? 'Deleting…' : 'Delete review'}
                  </button>
                  <button type="button" onClick={() => setConfirmingDelete(false)} disabled={remove.isPending}
                    className="ui-press h-10 border border-stone px-5 text-label-caps hover:border-espresso">
                    Keep it
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3">
                <button type="button" onClick={startEditing}
                  className="text-label-caps underline decoration-[0.5px] underline-offset-[6px] hover:text-brass-text">
                  Edit
                </button>
                <button type="button" onClick={() => setConfirmingDelete(true)}
                  className="text-label-caps underline decoration-[0.5px] underline-offset-[6px] hover:text-destructive">
                  Delete
                </button>
              </div>
            )}
            {existing && (
              <p className="mt-4 text-[12px] text-foreground-faint">Edits go back to us for approval before they show.</p>
            )}
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-7" noValidate>
            <StarPicker value={rating} onChange={setRating} />

            <Field label="Title" hint="Optional" htmlFor={`${ids}-title`}>
              <input id={`${ids}-title`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TITLE_MAX}
                placeholder="Sum it up in a few words" className={inputClass} />
            </Field>

            <Field label="Your review" htmlFor={`${ids}-body`}
              hint={bodyLength < BODY_MIN ? `At least ${BODY_MIN} characters` : `${bodyLength} / ${BODY_MAX}`}
              hintId={`${ids}-body-hint`}>
              <textarea id={`${ids}-body`} value={body} onChange={(e) => setBody(e.target.value)} maxLength={BODY_MAX} rows={5}
                required aria-describedby={`${ids}-body-hint`}
                placeholder="How does it look, feel and wear? Is it as pictured?" className={`${inputClass} resize-y`} />
            </Field>

            <div className="flex flex-wrap items-center gap-4">
              <button type="submit" disabled={upsert.isPending}
                className="ui-press h-[52px] w-full bg-espresso px-8 text-label-caps text-background hover:bg-espresso-hover disabled:cursor-wait disabled:opacity-60 sm:w-auto">
                {upsert.isPending ? 'Sending…' : existing ? 'Save changes' : 'Submit review'}
              </button>
              {existing && (
                <button type="button" onClick={() => { setEditing(false); setError(''); }}
                  className="text-label-caps underline decoration-[0.5px] underline-offset-[6px] hover:text-brass-text">
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}

        {error && <p className="mt-4 text-[13px] text-destructive" role="alert">{error}</p>}
        <p className="mt-4 text-[13px] text-olive empty:hidden" role="status">{notice}</p>
      </div>
    </article>
  );
}

function ProductHeading({ item, id }: { item: OrderReviewItem; id: string }) {
  return (
    <>
      <h2 id={id} className="text-[23px] leading-snug" style={{ fontFamily: 'var(--font-display)' }}>
        {item.product_slug ? (
          <Link to="/products/$productId" params={{ productId: item.product_slug }} className="hover:text-brass-text">
            {item.product_name}
          </Link>
        ) : item.product_name}
      </h2>
      {item.variant_label && <p className="mt-1 text-[13px] text-foreground-muted">Bought: {item.variant_label}</p>}
    </>
  );
}

const STAR_PATH = 'M12 2.5l2.94 6.08 6.56.9-4.78 4.6 1.17 6.62L12 17.56 6.11 20.7l1.17-6.62-4.78-4.6 6.56-.9z';

/** Radio group of five stars: arrow keys move and select, as with native radios. */
function StarPicker({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [hover, setHover] = useState(0);
  const labelId = useId();
  const shown = hover || value;

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, star: number) => {
    let next = 0;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(5, star + 1);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(1, star - 1);
    else if (event.key === 'Home') next = 1;
    else if (event.key === 'End') next = 5;
    if (!next) return;
    event.preventDefault();
    onChange(next);
    refs.current[next - 1]?.focus();
  };

  return (
    <div>
      <p id={labelId} className="text-label-caps">Your rating</p>
      <div role="radiogroup" aria-labelledby={labelId} className="mt-2 flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((star) => {
          const checked = value === star;
          // Roving tabindex: the chosen star (or the first, when none is chosen) is the tab stop.
          const tabbable = checked || (value === 0 && star === 1);
          return (
            <button
              key={star}
              ref={(el) => { refs.current[star - 1] = el; }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={star === 1 ? '1 star' : `${star} stars`}
              tabIndex={tabbable ? 0 : -1}
              onClick={() => onChange(star)}
              onKeyDown={(e) => onKeyDown(e, star)}
              onMouseEnter={() => setHover(star)}
              className="flex h-11 w-11 items-center justify-center focus-visible:outline focus-visible:outline-1 focus-visible:outline-espresso"
            >
              <svg viewBox="0 0 24 24" width={26} height={26} aria-hidden="true" className={star <= shown ? 'text-brass' : 'text-stone'}>
                <path d={STAR_PATH} fill={star <= shown ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.2} strokeLinejoin="round" />
              </svg>
            </button>
          );
        })}
        <span className="ml-2 text-[13px] text-foreground-muted" aria-hidden="true">
          {value ? `${value} of 5` : ''}
        </span>
      </div>
    </div>
  );
}

function Field({ label, hint, hintId, htmlFor, children }: { label: string; hint?: string; hintId?: string; htmlFor: string; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-label-caps">{label}</label>
        {hint && <span id={hintId} className="text-[11px] text-foreground-faint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
