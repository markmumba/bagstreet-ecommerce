import axios, { type AxiosError, type AxiosInstance } from 'axios';
import type { ApiResponse } from 'shared';

let authToken: string | null = null;
let isRefreshing = false;
let refreshQueue: Array<(token: string | null) => void> = [];

function drainQueue(token: string | null) {
  refreshQueue.forEach((cb) => cb(token));
  refreshQueue = [];
}

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: import.meta.env.VITE_SERVER_URL || 'http://localhost:3000',
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
      withCredentials: true,
    });

    this.setupInterceptors();
  }

  setAuthToken(token: string | null) {
    authToken = token;
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
        const originalRequest = error.config as any;

        // Attempt silent token refresh on 401 — only when we had a token
        if (
          error.response?.status === 401 &&
          !originalRequest._retry &&
          authToken !== null
        ) {
          if (isRefreshing) {
            return new Promise((resolve, reject) => {
              refreshQueue.push((token) => {
                if (token) {
                  originalRequest.headers.Authorization = `Bearer ${token}`;
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
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return this.client(originalRequest);
          } catch {
            drainQueue(null);
            localStorage.removeItem('bagstreet_token');
            if (window.location.pathname !== '/login') {
              window.location.href = '/login';
            }
            return Promise.reject(error);
          } finally {
            isRefreshing = false;
          }
        }

        const apiError = {
          message: error.response?.data?.message || 'An unexpected error occurred',
          status: error.response?.status || 500,
          code: error.response?.data?.error || 'UNKNOWN_ERROR',
        };
        return Promise.reject(apiError);
      }
    );
  }

  async get<T>(url: string, params?: Record<string, unknown>) {
    const response = await this.client.get<ApiResponse<T>>(url, { params });
    return response.data;
  }

  async post<T>(url: string, data?: unknown) {
    const response = await this.client.post<ApiResponse<T>>(url, data);
    return response.data;
  }

  async postForm<T>(url: string, data: FormData) {
    const response = await this.client.post<ApiResponse<T>>(url, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async put<T>(url: string, data?: unknown) {
    const response = await this.client.put<ApiResponse<T>>(url, data);
    return response.data;
  }

  async patch<T>(url: string, data?: unknown) {
    const response = await this.client.patch<ApiResponse<T>>(url, data);
    return response.data;
  }

  async delete<T>(url: string) {
    const response = await this.client.delete<ApiResponse<T>>(url);
    return response.data;
  }
}

export const apiClient = new ApiClient();
