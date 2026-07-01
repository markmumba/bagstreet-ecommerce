import { createContext, useContext, useEffect, useState } from 'react';
import { apiClient } from '@/services/api';
import { USER_ROLE, type UserResponse } from 'shared';

interface AuthContextValue {
  user: UserResponse | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function isCustomerUser(user: UserResponse): boolean {
  return user.role === USER_ROLE.CUSTOMER;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('bagstreet_store_token');
    if (token) {
      apiClient.setAuthToken(token);
      apiClient.get<UserResponse>('/api/auth/me')
        .then((res) => {
          if (res.data && isCustomerUser(res.data)) {
            setUser(res.data);
            return;
          }
          localStorage.removeItem('bagstreet_store_token');
          apiClient.setAuthToken(null);
          setUser(null);
        })
        .catch(() => { localStorage.removeItem('bagstreet_store_token'); apiClient.setAuthToken(null); })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const res = await apiClient.post<{ access_token: string; user: UserResponse }>('/api/auth/login', { email, password });
    const { access_token, user } = res.data!;
    if (!isCustomerUser(user)) {
      throw new Error('Please use the admin portal for this account');
    }
    localStorage.setItem('bagstreet_store_token', access_token);
    apiClient.setAuthToken(access_token);
    setUser(user);
  };

  const register = async (email: string) => {
    await apiClient.post('/api/auth/register', { email });
  };

  const logout = async () => {
    await apiClient.post('/api/auth/logout').catch(() => {});
    localStorage.removeItem('bagstreet_store_token');
    apiClient.setAuthToken(null);
    setUser(null);
  };

  const refreshUser = async () => {
    const res = await apiClient.get<UserResponse>('/api/auth/me');
    setUser(res.data ?? null);
  };

  return <AuthContext.Provider value={{ user, isLoading, login, register, logout, refreshUser }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
