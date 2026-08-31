'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api, type LoginResponse } from './api';

interface AuthState {
  token: string | null;
  user: LoginResponse['user'] | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Deliberate MVP design decision (see docs/architecture/SECURITY_ARCHITECTURE.md): the
 * JWT lives only in React state, never in localStorage/sessionStorage/cookies. This
 * means a hard page refresh logs the analyst out and back to /login — an accepted
 * trade-off for the MVP that eliminates an entire class of XSS-token-theft and CSRF
 * concerns outright. A persistent-but-safe session (httpOnly cookie + refresh token,
 * issued by a new /auth/refresh endpoint) is a documented Phase 3 follow-up, not a
 * silently-cut corner.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ token: null, user: null });
  const router = useRouter();

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.login(email, password);
      setState({ token: res.accessToken, user: res.user });
    },
    [],
  );

  const logout = useCallback(() => {
    setState({ token: null, user: null });
    router.push('/login');
  }, [router]);

  const value = useMemo<AuthContextValue>(() => ({ ...state, login, logout }), [state, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
