import { apiClient } from './api';
import { USER_ROLE } from 'shared';
import type { UserResponse, UserRole } from 'shared';

export interface AdminUserCreateRequest {
  email: string;
  full_name: string;
  role: typeof USER_ROLE.ADMIN | typeof USER_ROLE.MANAGER;
}

export interface UserUpdateRequest {
  full_name?: string;
  role?: UserRole;
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
