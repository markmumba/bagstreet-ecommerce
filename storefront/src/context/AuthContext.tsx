import { createContext, useContext, useEffect, useState } from 'react';
import { apiClient } from '@/services/api';
import type { UserResponse } from 'shared';

interface AuthContextValue {
  user: UserResponse | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, fullName: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('bagstreet_store_token');
    if (token) {
      apiClient.setAuthToken(token);
      apiClient.get<UserResponse>('/api/auth/me')
        .then((res) => setUser(res.data ?? null))
        .catch(() => { localStorage.removeItem('bagstreet_store_token'); apiClient.setAuthToken(null); })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const res = await apiClient.post<{ access_token: string; user: UserResponse }>('/api/auth/login', { email, password });
    const { access_token, user } = res.data!;
    localStorage.setItem('bagstreet_store_token', access_token);
    apiClient.setAuthToken(access_token);
    setUser(user);
  };

  const register = async (email: string, fullName: string, password: string) => {
    const res = await apiClient.post<{ access_token: string; user: UserResponse }>('/api/auth/register', { email, full_name: fullName, password });
    const { access_token, user } = res.data!;
    localStorage.setItem('bagstreet_store_token', access_token);
    apiClient.setAuthToken(access_token);
    setUser(user);
  };

  const logout = async () => {
    await apiClient.post('/api/auth/logout').catch(() => {});
    localStorage.removeItem('bagstreet_store_token');
    apiClient.setAuthToken(null);
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
