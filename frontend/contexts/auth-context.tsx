'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@/lib/types';
import { api } from '@/lib/api';
import { broadcastLogout, onRemoteLogout, TOKEN_KEY } from '@/lib/session-sync';
import { bindUserTheme, clearActiveThemeUser } from '@/lib/user-theme';

export type LoginResult =
  | { user: User }
  | { mfa_required: true; mfa_token: string };

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<LoginResult>;
  loginWithToken: (token: string) => Promise<User>;
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
        if (!cancelled) {
          if (u) bindUserTheme(u);
          setUser(u);
        }
      })
      .catch(() => {
        if (cancelled) return;
        localStorage.removeItem(TOKEN_KEY);
        clearActiveThemeUser();
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
    clearActiveThemeUser();
    setUser(null);
    router.replace('/login');
  }, [router]);

  useEffect(() => onRemoteLogout(() => clearSession()), [clearSession]);

  const finishLogin = async (token: string) => {
    localStorage.setItem(TOKEN_KEY, token.trim());
    const userData = await api.auth.me();
    bindUserTheme(userData);
    setUser(userData);
    return userData;
  };

  const loginWithToken = async (token: string) => {
    return finishLogin(token);
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
    const next = await api.auth.me();
    setUser((prev) => {
      if (!prev || prev.id !== next.id) bindUserTheme(next);
      return next;
    });
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
      value={{
        user,
        loading,
        login,
        loginWithToken,
        completeMfa,
        logout,
        refreshUser,
        isAuthenticated: !!user,
      }}
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
