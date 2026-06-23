import { apiClient } from './api';
import type { UserResponse } from 'shared';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

export interface AuthResponse {
  access_token: string;
  user: AuthUser;
}

export const authService = {
  login: (email: string, password: string) =>
    apiClient.post<AuthResponse>('/api/auth/login', { email, password }),

  register: (email: string, full_name: string, password: string) =>
    apiClient.post<AuthResponse>('/api/auth/register', { email, full_name, password }),

  logout: () => apiClient.post<null>('/api/auth/logout'),

  refresh: () => apiClient.post<{ access_token: string }>('/api/auth/refresh'),

  me: () => apiClient.get<UserResponse>('/api/auth/me'),
};
