import { apiClient } from './api';
import type { UserResponse, UserCreateRequest } from 'shared';

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

  create: (data: UserCreateRequest) => apiClient.post<UserResponse>('/api/users', data),

  update: (id: string, data: UserUpdateRequest) =>
    apiClient.patch<UserResponse>(`/api/users/${id}`, data),

  delete: (id: string) => apiClient.delete<void>(`/api/users/${id}`),
};
