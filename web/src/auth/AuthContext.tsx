import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  apiLogin,
  apiLogout,
  loadAuth,
  saveAuth,
  type AuthResult,
  type AuthUser,
} from './auth';

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthResult | null>(() => loadAuth());

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiLogin(email, password);
    saveAuth(result);
    setAuth(result);
  }, []);

  const logout = useCallback(() => {
    void apiLogout(auth?.refreshToken);
    saveAuth(null);
    setAuth(null);
  }, [auth]);

  const value = useMemo<AuthContextValue>(
    () => ({ user: auth?.user ?? null, isAuthenticated: Boolean(auth), login, logout }),
    [auth, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
