
import type { AppContext } from '@server/lib/hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiResponse, PaginatedResponse } from 'shared/dist';

export function success<T>(c: AppContext, data: T, message = 'Success', status: ContentfulStatusCode = 200) {
  const response: ApiResponse<T> = {
    success: true,
    status,
    message,
    data,
  };

  return c.json(response, status);
}

export function paginated<T>(
  c: AppContext,
  data: T[],
  page: number,
  limit: number,
  total: number,
  message = 'Success',
  status: ContentfulStatusCode = 200
) {
  const response: PaginatedResponse<T> = {
    success: true,
    status,
    message,
    data,
    pagination: {
      page,
      limit,
      total,
    },
  };
  return c.json(response, status);
}

export function error(c: AppContext, message: string, status: ContentfulStatusCode = 500, code?: string) {
  const response: ApiResponse<undefined> = {
    success: false,
    status,
    message,
    error: code,
  };
  return c.json(response, status);
}
