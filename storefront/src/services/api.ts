import axios, { type AxiosError, type AxiosInstance } from 'axios';
import type { ApiResponse } from 'shared';

let authToken: string | null = localStorage.getItem('bagstreet_store_token');
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
    this.client.interceptors.request.use((config) => {
      if (authToken) config.headers.Authorization = `Bearer ${authToken}`;
      return config;
    });

    this.client.interceptors.response.use(
      (res) => res,
      async (error: AxiosError<ApiResponse>) => {
        const original = error.config as any;
        if (error.response?.status === 401 && !original._retry && authToken !== null) {
          if (isRefreshing) {
            return new Promise((resolve, reject) => {
              refreshQueue.push((token) => {
                if (token) { delete (original.headers as any).Authorization; resolve(this.client(original)); }
                else reject(error);
              });
            });
          }
          original._retry = true;
          isRefreshing = true;
          authToken = null;
          try {
            const res = await this.client.post<ApiResponse<{ access_token: string }>>('/api/auth/refresh');
            const newToken = res.data.data!.access_token;
            authToken = newToken;
            localStorage.setItem('bagstreet_store_token', newToken);
            drainQueue(newToken);
            // Delete stale header; request interceptor re-adds it with fresh token
            delete (original.headers as any).Authorization;
            return this.client(original);
          } catch {
            drainQueue(null);
            localStorage.removeItem('bagstreet_store_token');
            if (window.location.pathname !== '/login') window.location.href = '/login';
            return Promise.reject(error);
          } finally {
            isRefreshing = false;
          }
        }
        return Promise.reject({
          message: error.response?.data?.message || 'An unexpected error occurred',
          status: error.response?.status || 500,
        });
      }
    );
  }

  async get<T>(url: string, params?: Record<string, unknown>) {
    const res = await this.client.get<ApiResponse<T>>(url, { params });
    return res.data;
  }
  async post<T>(url: string, data?: unknown) {
    const res = await this.client.post<ApiResponse<T>>(url, data);
    return res.data;
  }
  async patch<T>(url: string, data?: unknown) {
    const res = await this.client.patch<ApiResponse<T>>(url, data);
    return res.data;
  }
  async delete<T>(url: string) {
    const res = await this.client.delete<ApiResponse<T>>(url);
    return res.data;
  }
}

export const apiClient = new ApiClient();
