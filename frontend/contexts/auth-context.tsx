'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@/lib/types';
import { api } from '@/lib/api';
import { broadcastLogout, onRemoteLogout, TOKEN_KEY } from '@/lib/session-sync';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Resolved asynchronously in every branch so there is no synchronous setState in
    // the effect body, and so an unmount mid-flight cannot set state on a dead tree.
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

  // Another tab signed out, or the API rejected our token as expired. Either way this
  // tab must stop showing authenticated content without waiting for its own failure.
  useEffect(() => onRemoteLogout(() => clearSession()), [clearSession]);

  const login = async (email: string, password: string, rememberMe = true) => {
    const response = await api.auth.login({ email, password, remember_me: rememberMe });
    const token = (response.access_token || '').trim();
    if (!token) throw new Error('No token received');
    localStorage.setItem(TOKEN_KEY, token);
    const userData = await api.auth.me();
    setUser(userData);
  };

  const logout = useCallback(async () => {
    // Revoke server-side first: that is what stops the token working in other tabs and
    // on other devices. A failure here must not trap the user in the app, so the local
    // teardown happens either way.
    try {
      await api.auth.logout();
    } catch {
      // Already expired or offline — nothing left to revoke.
    }
    broadcastLogout();
    clearSession();
  }, [clearSession]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAuthenticated: !!user }}>
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
