import type { BaseType } from "./baseType";

export const USER_ROLE = {
  ADMIN: 'ADMIN',
  CUSTOMER: 'CUSTOMER',
  MANAGER: 'MANAGER',
} as const;

export type UserRole = typeof USER_ROLE[keyof typeof USER_ROLE];

// Backward-compatible alias for existing imports.
export const role = USER_ROLE;

export interface User extends BaseType {
  email: string;
  full_name: string;
  password_hash: string; 
  role: UserRole;
  is_active: boolean;
}

export interface UserCreateRequest {
  email:string;
  full_name:string;
  password: string;
  role:string;
}

export interface UserResponse {
  id: string;
  email: string;
  full_name:string;
  role: UserRole;
  is_active: boolean,
  created_at: string,
  updated_at: string,
}
