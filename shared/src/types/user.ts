import type { BaseType } from "./baseType";

export enum role {
  ADMIN = 'ADMIN',
  CUSTOMER='CUSTOMER',
  MANAGER='MANAGER'
};

export interface User extends BaseType {
  email: string;
  full_name: string;
  password_hash: string; 
  role: role;
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
  role:string;
  is_active: boolean,
  created_at: string,
  updated_at: string,
}