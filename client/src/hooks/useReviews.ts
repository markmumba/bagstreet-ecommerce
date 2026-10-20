import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { reviewsService, type ReviewFilters } from '@/services/reviews.service';

export const reviewKeys = {
  all: ['reviews'] as const,
  list: (filters: ReviewFilters) => ['reviews', 'list', filters] as const,
  counts: ['reviews', 'counts'] as const,
};

export function useAdminReviews(filters: ReviewFilters) {
  return useQuery({
    queryKey: reviewKeys.list(filters),
    queryFn: () => reviewsService.list(filters),
    placeholderData: keepPreviousData,
  });
}

export function useReviewCounts() {
  return useQuery({ queryKey: reviewKeys.counts, queryFn: () => reviewsService.counts() });
}

/** Publishing, not publishing and replying change the lists and the counts. */
function useReviewMutation<T>(mutationFn: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: reviewKeys.all }),
  });
}

export const useApproveReview = () => useReviewMutation((id: string) => reviewsService.approve(id));

export const useRejectReview = () =>
  useReviewMutation(({ id, reason }: { id: string; reason: string }) => reviewsService.reject(id, reason));

export const useReplyToReview = () =>
  useReviewMutation(({ id, body }: { id: string; body: string }) => reviewsService.reply(id, body));
