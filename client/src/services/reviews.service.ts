import { apiClient } from './api';
import type { AdminReviewResponse, ReviewCountsResponse, ReviewStatus } from 'shared';

export interface ReviewFilters {
  status: ReviewStatus;
  page: number;
  limit: number;
}

export const reviewsService = {
  list: (filters: ReviewFilters) =>
    apiClient.getPage<AdminReviewResponse>('/api/reviews/admin', filters as unknown as Record<string, unknown>),
  counts: () => apiClient.get<ReviewCountsResponse>('/api/reviews/admin/counts'),
  approve: (id: string) => apiClient.post<AdminReviewResponse>(`/api/reviews/admin/${id}/approve`),
  reject: (id: string, reason: string) =>
    apiClient.post<AdminReviewResponse>(`/api/reviews/admin/${id}/reject`, { reason }),
  reply: (id: string, body: string) => apiClient.put<AdminReviewResponse>(`/api/reviews/admin/${id}/reply`, { body }),
};
