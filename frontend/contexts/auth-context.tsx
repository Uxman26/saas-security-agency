'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@/lib/types';
import { api } from '@/lib/api';
import { broadcastLogout, onRemoteLogout, TOKEN_KEY } from '@/lib/session-sync';

export type LoginResult =
  | { user: User }
  | { mfa_required: true; mfa_token: string };

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<LoginResult>;
  completeMfa: (mfaToken: string, code: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    let cancelled = false;

    void (token ? api.auth.me() : Promise.resolve(null))
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch(() => {
        if (cancelled) return;
        localStorage.removeItem(TOKEN_KEY);
        setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    router.replace('/login');
  }, [router]);

  useEffect(() => onRemoteLogout(() => clearSession()), [clearSession]);

  const finishLogin = async (token: string) => {
    localStorage.setItem(TOKEN_KEY, token.trim());
    const userData = await api.auth.me();
    setUser(userData);
    return userData;
  };

  const login = async (email: string, password: string, rememberMe = true): Promise<LoginResult> => {
    const response = await api.auth.login({ email, password, remember_me: rememberMe });
    if (response.mfa_required && response.mfa_token) {
      return { mfa_required: true, mfa_token: response.mfa_token };
    }
    const token = (response.access_token || '').trim();
    if (!token) throw new Error('No token received');
    const userData = await finishLogin(token);
    return { user: userData };
  };

  const completeMfa = async (mfaToken: string, code: string) => {
    const response = await api.auth.verifyMfa(mfaToken, code);
    const token = (response.access_token || '').trim();
    if (!token) throw new Error('No token received');
    return finishLogin(token);
  };

  const refreshUser = useCallback(async () => {
    setUser(await api.auth.me());
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      /* already expired */
    }
    broadcastLogout();
    clearSession();
  }, [clearSession]);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, completeMfa, logout, refreshUser, isAuthenticated: !!user }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
