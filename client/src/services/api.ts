import axios, { type AxiosError, type AxiosInstance, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import type { ApiResponse, PaginatedResponse } from 'shared';

/** What every failed request rejects with. */
export interface ApiError {
  message: string;
  status: number;
  code: string;
}

/** One page of a server-paginated list. */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

let authToken: string | null = localStorage.getItem('bagstreet_token');
let isRefreshing = false;
let refreshQueue: Array<(token: string | null) => void> = [];
let authExpiredDispatched = false;

function drainQueue(token: string | null) {
  refreshQueue.forEach((cb) => cb(token));
  refreshQueue = [];
}

function expireAuth() {
  authToken = null;
  localStorage.removeItem('bagstreet_token');
  drainQueue(null);

  if (!authExpiredDispatched) {
    authExpiredDispatched = true;
    window.dispatchEvent(new Event('bagstreet:auth-expired'));
  }
}

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: import.meta.env.VITE_SERVER_URL || 'http://localhost:3000',
      headers: {
        'Content-Type': 'application/json',
        'X-Bagstreet-App': 'admin',
      },
      timeout: 10000,
      withCredentials: true,
    });

    this.setupInterceptors();
  }

  setAuthToken(token: string | null) {
    authToken = token;
    if (token) authExpiredDispatched = false;
  }

  private setupInterceptors() {
    this.client.interceptors.request.use(
      (config) => {
        if (authToken) {
          config.headers.Authorization = `Bearer ${authToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<ApiResponse>) => {
        const originalRequest = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
        const requestUrl = originalRequest?.url ?? '';
        const isAuthRequest =
          requestUrl.includes('/api/auth/login') ||
          requestUrl.includes('/api/auth/register') ||
          requestUrl.includes('/api/auth/refresh') ||
          requestUrl.includes('/api/auth/logout');

        // Attempt silent token refresh on 401 — only when we had a token
        if (
          error.response?.status === 401 &&
          originalRequest &&
          !originalRequest._retry &&
          authToken !== null &&
          !isAuthRequest
        ) {
          if (isRefreshing) {
            return new Promise((resolve, reject) => {
              refreshQueue.push((token) => {
                if (token) {
                  delete originalRequest.headers.Authorization;
                  resolve(this.client(originalRequest));
                } else {
                  reject(error);
                }
              });
            });
          }

          originalRequest._retry = true;
          isRefreshing = true;
          authToken = null; // clear so the refresh call itself doesn't trigger retry

          try {
            const res = await this.client.post<ApiResponse<{ access_token: string }>>(
              '/api/auth/refresh'
            );
            const newToken = res.data.data!.access_token;
            authToken = newToken;
            localStorage.setItem('bagstreet_token', newToken);
            drainQueue(newToken);
            // Delete stale header; request interceptor re-adds it with fresh token
            delete originalRequest.headers.Authorization;
            return this.client(originalRequest);
          } catch {
            expireAuth();
            return Promise.reject(error);
          } finally {
            isRefreshing = false;
          }
        }

        const apiError: ApiError = {
          message: error.response?.data?.message || 'An unexpected error occurred',
          status: error.response?.status || 500,
          code: error.response?.data?.error || 'UNKNOWN_ERROR',
        };
        return Promise.reject(apiError);
      }
    );
  }

  // Every method unwraps the server's envelope once: callers get the data itself, and a response
  // with success: false is thrown like any other error (as an ApiError).
  private unwrap<T>(response: AxiosResponse<ApiResponse<T>>): T {
    const body = response.data;
    if (!body.success) throw { message: body.message, status: body.status, code: body.error ?? 'UNKNOWN_ERROR' } satisfies ApiError;
    return body.data as T;
  }

  async get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    return this.unwrap(await this.client.get<ApiResponse<T>>(url, { params }));
  }

  /** A paginated list: the rows and the total, for tables with server-side paging. */
  async getPage<T>(url: string, params?: Record<string, unknown>): Promise<Page<T>> {
    const response = await this.client.get<PaginatedResponse<T>>(url, { params });
    const items = this.unwrap(response) ?? [];
    const pagination = response.data.pagination;
    return { items, total: pagination?.total ?? items.length, page: pagination?.page ?? 1, limit: pagination?.limit ?? items.length };
  }

  async post<T>(url: string, data?: unknown): Promise<T> {
    return this.unwrap(await this.client.post<ApiResponse<T>>(url, data));
  }

  async postForm<T>(url: string, data: FormData): Promise<T> {
    return (await this.postFormWithMessage<T>(url, data)).data;
  }

  /** For the few screens that show the server's message alongside the result (e.g. a statement preview). */
  async postFormWithMessage<T>(url: string, data: FormData): Promise<{ data: T; message: string }> {
    const response = await this.client.post<ApiResponse<T>>(url, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return { data: this.unwrap(response), message: response.data.message };
  }

  async put<T>(url: string, data?: unknown): Promise<T> {
    return this.unwrap(await this.client.put<ApiResponse<T>>(url, data));
  }

  async putForm<T>(url: string, data: FormData): Promise<T> {
    return this.unwrap(await this.client.put<ApiResponse<T>>(url, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }));
  }

  async patch<T>(url: string, data?: unknown): Promise<T> {
    return this.unwrap(await this.client.patch<ApiResponse<T>>(url, data));
  }

  async delete<T>(url: string): Promise<T> {
    return this.unwrap(await this.client.delete<ApiResponse<T>>(url));
  }
}

export const apiClient = new ApiClient();
