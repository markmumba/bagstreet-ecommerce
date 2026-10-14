import { createContext, useContext, useEffect, useState } from 'react';
import { apiClient, hasSessionHint } from '@/services/api';
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
    if (!hasSessionHint()) {
      setIsLoading(false);
      return;
    }

    // The access token is kept in memory only, so a page load restores the session from the
    // HttpOnly refresh cookie.
    apiClient.restoreSession()
      .then((token) => (token ? apiClient.get<UserResponse>('/api/auth/me') : null))
      .then((res) => {
        if (res?.data && isCustomerUser(res.data)) {
          setUser(res.data);
          return;
        }
        apiClient.setAuthToken(null);
        setUser(null);
      })
      .catch(() => apiClient.setAuthToken(null))
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const res = await apiClient.post<{ access_token: string; user: UserResponse }>('/api/auth/login', { email, password });
    const { access_token, user } = res.data!;
    if (!isCustomerUser(user)) {
      throw new Error('Please use the admin portal for this account');
    }
    apiClient.setAuthToken(access_token);
    setUser(user);
  };

  const register = async (email: string) => {
    await apiClient.post('/api/auth/register', { email });
  };

  const logout = async () => {
    await apiClient.post('/api/auth/logout').catch(() => {});
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
