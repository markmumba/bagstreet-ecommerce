import { apiClient } from './api';
import type { UserResponse } from 'shared';

export interface AdminUserCreateRequest {
  email: string;
  full_name: string;
  role: 'ADMIN' | 'MANAGER';
}

export interface UserUpdateRequest {
  full_name?: string;
  role?: string;
  is_active?: boolean;
}

export interface UserListParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  status?: string;
}

export const usersService = {
  getAll: (params?: UserListParams) =>
    apiClient.get<UserResponse[]>('/api/users', params as Record<string, unknown>),

  getById: (id: string) => apiClient.get<UserResponse>(`/api/users/${id}`),

  create: (data: AdminUserCreateRequest) => apiClient.post<UserResponse>('/api/users', data),

  update: (id: string, data: UserUpdateRequest) =>
    apiClient.patch<UserResponse>(`/api/users/${id}`, data),

  delete: (id: string) => apiClient.delete<void>(`/api/users/${id}`),
};
