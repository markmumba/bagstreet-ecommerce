import axios, { type AxiosError, type AxiosInstance } from 'axios';
import type { ApiResponse } from 'shared';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: import.meta.env.VITE_SERVER_URL || 'http://localhost:3000',
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor - add auth token if available
    this.client.interceptors.request.use(
      (config) => {
        // Future: Add auth token here
        // const token = localStorage.getItem('auth_token');
        // if (token) {
        //   config.headers.Authorization = `Bearer ${token}`;
        // }
        return config;
      },
      (error) => Promise.reject(error)
    );
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError<ApiResponse>) => {
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

  async put<T>(url: string, data?: unknown) {
    const response = await this.client.put<ApiResponse<T>>(url, data);
    return response.data;
  }

  async delete<T>(url: string) {
    const response = await this.client.delete<ApiResponse<T>>(url);
    return response.data;
  }
}

export const apiClient = new ApiClient();
