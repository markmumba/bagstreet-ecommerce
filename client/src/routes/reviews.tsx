import { createFileRoute, Link } from '@tanstack/react-router';
import { useId, useState } from 'react';
import { Star } from 'lucide-react';
import { REVIEW_STATUS, type AdminReviewResponse, type ReviewStatus } from 'shared';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useListParams } from '@/hooks/useListParams';
import { useAdminReviews, useApproveReview, useRejectReview, useReplyToReview, useReviewCounts } from '@/hooks/useReviews';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ErrorNotice, errorMessage } from '@/components/ui/notice';
import { formatDateTime } from '@/lib/format';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/reviews')({
  component: ReviewsPage,
});

const LIMIT = 20;
const REPLY_MAX = 1000;
const REASON_MIN = 3;
const REASON_MAX = 300;
const QUICK_REASONS = ['Abusive language', 'Contains personal details', 'Not about the product'];

const TABS: { status: ReviewStatus; label: string; empty: string }[] = [
  { status: REVIEW_STATUS.PENDING, label: 'Pending', empty: 'No reviews waiting. New ones appear here, and in your notifications.' },
  { status: REVIEW_STATUS.APPROVED, label: 'Published', empty: 'No published reviews yet. Reviews you publish show on the product page.' },
  { status: REVIEW_STATUS.REJECTED, label: 'Not published', empty: 'Nothing here. Reviews you decide not to publish are kept here with the reason.' },
];

function isReviewStatus(value: unknown): value is ReviewStatus {
  return typeof value === 'string' && (Object.values(REVIEW_STATUS) as string[]).includes(value);
}

function ReviewsPage() {
  const list = useListParams({ status: REVIEW_STATUS.PENDING as string });
  const { page, setPage } = list;
  const status: ReviewStatus = isReviewStatus(list.params.status) ? list.params.status : REVIEW_STATUS.PENDING;
  const tab = TABS.find((t) => t.status === status)!;

  const { data, isLoading, isError, error, refetch, isFetching } = useAdminReviews({ status, page, limit: LIMIT });
  const { data: counts } = useReviewCounts();
  const reviews = data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / LIMIT));

  const [rejecting, setRejecting] = useState<AdminReviewResponse | null>(null);

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-semibold leading-tight">Reviews</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Check customer reviews before they show on the shop. Publish negative reviews too: don’t publish only for abuse, personal details or off-topic posts.
          </p>
        </div>

        <section className="min-w-0 rounded-xl border bg-card">
          <div className="flex flex-wrap gap-1 border-b px-4 py-3" role="group" aria-label="Show reviews">
            {TABS.map((t) => (
              <Button key={t.status} size="sm" variant={status === t.status ? 'default' : 'ghost'} className="h-8"
                aria-pressed={status === t.status} onClick={() => list.update({ status: t.status })}>
                {t.label}
                {t.status === REVIEW_STATUS.PENDING && counts && (
                  <span className={cn('rounded-full px-1.5 text-xs tabular-nums',
                    status === t.status ? 'bg-primary-foreground/20' : 'bg-muted')}>
                    {counts.pending}
                  </span>
                )}
              </Button>
            ))}
          </div>

          <div className="divide-y">
            {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading reviews…</p>}
            {isError && (
              <div className="flex flex-col items-start gap-3 p-4">
                <ErrorNotice>{errorMessage(error, 'Reviews couldn’t be loaded. Check your connection and try again.')}</ErrorNotice>
                <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
                  {isFetching ? 'Trying again…' : 'Try again'}
                </Button>
              </div>
            )}
            {!isLoading && !isError && reviews.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">{tab.empty}</p>
            )}
            {!isError && reviews.map((review) => (
              <ReviewCard key={review.id} review={review} onReject={() => setRejecting(review)} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm">
              <span className="text-muted-foreground">Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </section>
      </div>

      <RejectDialog review={rejecting} onClose={() => setRejecting(null)} />
    </DashboardLayout>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span role="img" aria-label={`${rating} out of 5 stars`} className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} aria-hidden="true"
          className={cn('size-4', n <= rating ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground/40')} />
      ))}
    </span>
  );
}

function ReviewCard({ review, onReject }: { review: AdminReviewResponse; onReject: () => void }) {
  const approve = useApproveReview();
  const [replying, setReplying] = useState(false);

  const publish = () => {
    approve.mutate(review.id, {
      onSuccess: () => toast.success('Review published. It now shows on the product page.'),
      onError: (err) => toast.error(errorMessage(err, 'The review couldn’t be published. Try again.')),
    });
  };

  return (
    <article className="flex min-w-0 flex-col gap-3 px-4 py-4" aria-labelledby={`review-${review.id}-title`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Stars rating={review.rating} />
        <h2 id={`review-${review.id}-title`} className="min-w-0 break-words text-sm font-semibold [overflow-wrap:anywhere]">
          {review.title || <span className="font-normal text-muted-foreground">No title</span>}
        </h2>
      </div>

      <p className="whitespace-pre-line break-words text-sm [overflow-wrap:anywhere]">{review.body}</p>

      <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
        <span className="font-medium text-foreground">{review.author_name}</span>
        {' · '}{review.product_name}
        {review.variant_label && <> · Bought: {review.variant_label}</>}
        {' · '}
        <Link to="/orders" search={{ order_id: review.order_id }} className="underline underline-offset-2 hover:text-foreground">
          Order {review.order_number}
        </Link>
        {' · '}Written {formatDateTime(review.created_at)}
        {review.updated_at !== review.created_at && <> · Edited {formatDateTime(review.updated_at)}</>}
      </p>

      {review.status === REVIEW_STATUS.REJECTED && review.reject_reason && (
        <p className="rounded-lg border border-[var(--color-neutral-border)] bg-[var(--color-neutral-bg)] px-3 py-2 text-sm text-[var(--color-neutral-text)] [overflow-wrap:anywhere]">
          <span className="font-medium">Not published:</span> {review.reject_reason}
          {review.moderated_by_email && review.moderated_at && (
            <span className="block text-xs opacity-80">By {review.moderated_by_email}, {formatDateTime(review.moderated_at)}</span>
          )}
        </p>
      )}

      {review.reply_body && !replying && (
        <div className="rounded-lg border-l-2 border-primary/40 bg-muted/40 px-3 py-2 text-sm">
          <p className="text-xs font-medium text-muted-foreground">
            Reply from Bagstreet{review.replied_at && <> · {formatDateTime(review.replied_at)}</>}
          </p>
          <p className="mt-1 whitespace-pre-line break-words [overflow-wrap:anywhere]">{review.reply_body}</p>
        </div>
      )}

      {replying ? (
        <ReplyEditor review={review} onDone={() => setReplying(false)} />
      ) : (
        <div className="flex flex-wrap gap-2">
          {review.status !== REVIEW_STATUS.APPROVED && (
            <Button size="sm" onClick={publish} disabled={approve.isPending}>
              {approve.isPending ? 'Publishing…' : 'Publish'}
            </Button>
          )}
          {review.status === REVIEW_STATUS.PENDING && (
            <Button size="sm" variant="outline" onClick={onReject}>Don’t publish</Button>
          )}
          {review.status === REVIEW_STATUS.APPROVED && (
            <Button size="sm" variant="outline" onClick={onReject}>Unpublish</Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setReplying(true)}>
            {review.reply_body ? 'Edit reply' : 'Reply'}
          </Button>
        </div>
      )}
    </article>
  );
}

function ReplyEditor({ review, onDone }: { review: AdminReviewResponse; onDone: () => void }) {
  const id = useId();
  const reply = useReplyToReview();
  const [body, setBody] = useState(review.reply_body ?? '');
  const [error, setError] = useState('');
  const trimmed = body.trim();

  const save = (next: string) => {
    setError('');
    reply.mutate({ id: review.id, body: next }, {
      onSuccess: () => {
        toast.success(next ? 'Reply saved.' : 'Reply removed.');
        onDone();
      },
      onError: (err) => setError(errorMessage(err, 'The reply couldn’t be saved. Check your connection and try again.')),
    });
  };

  return (
    <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (trimmed) save(trimmed); }}>
      <Label htmlFor={`${id}-reply`}>Reply from Bagstreet</Label>
      <Textarea id={`${id}-reply`} value={body} onChange={(e) => setBody(e.target.value)} maxLength={REPLY_MAX}
        rows={3} aria-describedby={`${id}-count`} autoFocus placeholder="Thank the customer, or answer their question…" />
      <p id={`${id}-count`} className="text-xs text-muted-foreground tabular-nums">
        {body.length} / {REPLY_MAX} characters. Shown publicly under the review once it’s published.
      </p>
      <ErrorNotice>{error}</ErrorNotice>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={reply.isPending || !trimmed}>
          {reply.isPending ? 'Saving…' : 'Save reply'}
        </Button>
        {review.reply_body && (
          <Button type="button" size="sm" variant="outline" disabled={reply.isPending} onClick={() => save('')}>
            Remove reply
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" disabled={reply.isPending} onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

function RejectDialog({ review, onClose }: { review: AdminReviewResponse | null; onClose: () => void }) {
  const id = useId();
  const reject = useRejectReview();
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const unpublishing = review?.status === REVIEW_STATUS.APPROVED;
  const trimmed = reason.trim();
  const reasonError = trimmed.length < REASON_MIN ? `Give a reason (at least ${REASON_MIN} characters).` : '';

  const close = (open: boolean) => {
    if (open) return;
    setReason('');
    setTouched(false);
    onClose();
  };

  const confirm = async () => {
    setTouched(true);
    if (!review || reasonError) throw new Error(reasonError || 'No review selected.');
    await reject.mutateAsync({ id: review.id, reason: trimmed });
    toast.success(unpublishing ? 'Review unpublished.' : 'Review won’t be published.');
    setReason('');
    setTouched(false);
  };

  return (
    <ConfirmDialog
      open={review !== null}
      onOpenChange={close}
      title={unpublishing ? 'Unpublish this review?' : 'Don’t publish this review?'}
      description="Only hold back reviews with abuse, personal details or nothing about the product. Negative reviews should be published. The reason is recorded."
      confirmLabel={unpublishing ? 'Unpublish' : 'Don’t publish'}
      pendingLabel={unpublishing ? 'Unpublishing…' : 'Saving…'}
      destructive
      onConfirm={confirm}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-reason`}>Reason</Label>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Common reasons">
          {QUICK_REASONS.map((r) => (
            <Button key={r} type="button" size="sm" variant="outline" className="h-7 text-xs"
              aria-pressed={reason === r} onClick={() => { setReason(r); setTouched(true); }}>
              {r}
            </Button>
          ))}
        </div>
        <Textarea id={`${id}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} onBlur={() => setTouched(true)}
          required maxLength={REASON_MAX} rows={3} aria-invalid={touched && Boolean(reasonError)}
          aria-describedby={`${id}-reason-hint`} placeholder="Why this review isn’t shown…" />
        <p id={`${id}-reason-hint`} className={cn('text-xs tabular-nums', touched && reasonError ? 'text-destructive' : 'text-muted-foreground')}>
          {touched && reasonError ? reasonError : `${reason.length} / ${REASON_MAX} characters. Recorded with your name. The customer may see it.`}
        </p>
      </div>
    </ConfirmDialog>
  );
}
