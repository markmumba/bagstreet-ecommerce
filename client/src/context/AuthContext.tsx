import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { authService, type AuthUser } from '@/services/auth.service';
import { apiClient } from '@/services/api';
import { USER_ROLE } from 'shared';

const TOKEN_KEY = 'bagstreet_token';

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function isStaffUser(user: AuthUser): boolean {
  return user.role === USER_ROLE.ADMIN || user.role === USER_ROLE.MANAGER;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    function handleAuthExpired() {
      localStorage.removeItem(TOKEN_KEY);
      apiClient.setAuthToken(null);
      setUser(null);
      setIsLoading(false);
    }

    window.addEventListener('bagstreet:auth-expired', handleAuthExpired);

    const savedToken = localStorage.getItem(TOKEN_KEY);
    if (!savedToken) {
      setIsLoading(false);
      return () => window.removeEventListener('bagstreet:auth-expired', handleAuthExpired);
    }

    apiClient.setAuthToken(savedToken);
    authService
      .me()
      .then((res) => {
        if (res.data) {
          const authUser = {
            id: res.data.id,
            email: res.data.email,
            full_name: res.data.full_name,
            role: res.data.role,
          };
          if (!isStaffUser(authUser)) {
            localStorage.removeItem(TOKEN_KEY);
            apiClient.setAuthToken(null);
            setUser(null);
            return;
          }
          setUser(authUser);
        }
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        apiClient.setAuthToken(null);
      })
      .finally(() => setIsLoading(false));

    return () => window.removeEventListener('bagstreet:auth-expired', handleAuthExpired);
  }, []);

  const login = async (email: string, password: string): Promise<AuthUser> => {
    const res = await authService.login(email, password);
    if (res.data) {
      const { access_token, user: authUser } = res.data;
      if (!isStaffUser(authUser)) {
        throw new Error('This account does not have admin access');
      }
      localStorage.setItem(TOKEN_KEY, access_token);
      apiClient.setAuthToken(access_token);
      setUser(authUser);
      return authUser;
    }
    throw new Error('Invalid email or password');
  };

  const logout = async () => {
    try {
      await authService.logout();
    } finally {
      localStorage.removeItem(TOKEN_KEY);
      apiClient.setAuthToken(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
