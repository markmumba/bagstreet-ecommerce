import axios, { type AxiosError, type AxiosInstance } from 'axios';
import type { ApiResponse } from 'shared';

// The access token lives in memory only, so a script injected into the page can't read it from
// storage. A page load gets a new one from the HttpOnly refresh cookie (refreshSession).
let authToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;
let pageLoadRestore: Promise<string | null> | null = null;

// Not a credential: just remembers that this browser signed in, so guests' page loads don't ask
// for a session they can't have.
const SESSION_HINT_KEY = 'bagstreet_store_session';

function setSessionHint(signedIn: boolean) {
  try {
    if (signedIn) localStorage.setItem(SESSION_HINT_KEY, '1');
    else localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    // Storage blocked: page loads just always try the refresh cookie.
  }
}

// Earlier versions saved the access token itself: drop it, but remember the browser signed in.
try {
  if (localStorage.getItem('bagstreet_store_token')) {
    localStorage.removeItem('bagstreet_store_token');
    localStorage.setItem(SESSION_HINT_KEY, '1');
  }
} catch {
  // Storage blocked: nothing to migrate.
}

export function hasSessionHint(): boolean {
  try {
    return localStorage.getItem(SESSION_HINT_KEY) === '1';
  } catch {
    return true;
  }
}

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: import.meta.env.VITE_SERVER_URL || 'http://localhost:3000',
      headers: {
        'Content-Type': 'application/json',
        'X-Bagstreet-App': 'storefront',
      },
      timeout: 10000,
      withCredentials: true,
    });
    this.setupInterceptors();
  }

  setAuthToken(token: string | null) {
    authToken = token;
    setSessionHint(token !== null);
  }

  /**
   * The session for this page load: one refresh if this browser signed in before, shared by every
   * caller. Started as soon as this module loads, so the first API requests wait for it.
   */
  restoreSession(): Promise<string | null> {
    pageLoadRestore ??= hasSessionHint() ? this.refreshSession() : Promise.resolve(null);
    return pageLoadRestore;
  }

  /**
   * Swaps the refresh cookie for a new access token. Concurrent callers share one request, because
   * each refresh token works once. Resolves null when there is no session.
   */
  refreshSession(): Promise<string | null> {
    if (!refreshInFlight) {
      refreshInFlight = this.client
        .post<ApiResponse<{ access_token: string }>>('/api/auth/refresh')
        .then((res) => {
          const token = res.data.data!.access_token;
          this.setAuthToken(token);
          return token;
        })
        .catch(() => null)
        .finally(() => {
          refreshInFlight = null;
        });
    }
    return refreshInFlight;
  }

  private setupInterceptors() {
    this.client.interceptors.request.use(async (config) => {
      // While a page load is restoring the session, wait for it instead of failing with a 401.
      if (refreshInFlight && !config.url?.includes('/api/auth/')) await refreshInFlight;
      if (authToken) config.headers.Authorization = `Bearer ${authToken}`;
      return config;
    });

    this.client.interceptors.response.use(
      (res) => res,
      async (error: AxiosError<ApiResponse>) => {
        const original = error.config as any;
        const isAuthRequest = String(original?.url ?? '').includes('/api/auth/');
        if (error.response?.status === 401 && original && !original._retry && authToken !== null && !isAuthRequest) {
          original._retry = true;
          const token = await this.refreshSession();
          if (token) {
            // Delete stale header; request interceptor re-adds it with fresh token
            delete (original.headers as any).Authorization;
            return this.client(original);
          }
          this.setAuthToken(null);
          if (window.location.pathname !== '/login') window.location.href = '/login';
          return Promise.reject(error);
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
  async put<T>(url: string, data?: unknown) {
    const res = await this.client.put<ApiResponse<T>>(url, data);
    return res.data;
  }
  async delete<T>(url: string, data?: unknown) {
    const res = await this.client.delete<ApiResponse<T>>(url, data === undefined ? undefined : { data });
    return res.data;
  }
}

export const apiClient = new ApiClient();
apiClient.restoreSession();
