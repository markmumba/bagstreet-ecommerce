import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { authService, type AuthUser } from '@/services/auth.service';
import { apiClient } from '@/services/api';

const TOKEN_KEY = 'bagstreet_token';

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY);
    if (!savedToken) {
      setIsLoading(false);
      return;
    }

    apiClient.setAuthToken(savedToken);
    authService
      .me()
      .then((res) => {
        if (res.data) {
          setUser({
            id: res.data.id,
            email: res.data.email,
            full_name: res.data.full_name,
            role: res.data.role,
          });
        }
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        apiClient.setAuthToken(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const res = await authService.login(email, password);
    if (res.data) {
      const { access_token, user: authUser } = res.data;
      localStorage.setItem(TOKEN_KEY, access_token);
      apiClient.setAuthToken(access_token);
      setUser(authUser);
    }
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
