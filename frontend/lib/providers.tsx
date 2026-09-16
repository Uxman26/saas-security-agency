'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, useTheme } from 'next-themes';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { AuthProvider, useAuth } from '@/contexts/auth-context';
import { LeadNotificationsProvider } from '@/components/lead-notifications-provider';
import { HelpAssistant } from '@/components/help/help-assistant';
import { Toaster } from '@/components/ui/sonner';
import { api } from '@/lib/api';
import {
  THEME_GUEST_KEY,
  bindUserTheme,
  clearActiveThemeUser,
  isThemePreference,
  persistUserThemeLocal,
  readActiveThemeUserId,
  themeStorageKey,
} from '@/lib/user-theme';

function UserThemeProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const storageKey = useMemo(() => {
    if (user) return themeStorageKey(user.id);
    if (loading) return themeStorageKey(readActiveThemeUserId());
    return THEME_GUEST_KEY;
  }, [user?.id, loading]);

  const userId = user?.id ?? null;

  useEffect(() => {
    if (loading) return;
    if (user) bindUserTheme(user);
    else clearActiveThemeUser();
  }, [loading, userId]);

  return (
    <ThemeProvider
      key={storageKey}
      storageKey={storageKey}
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
    >
      <ThemePreferenceSync />
      {children}
    </ThemeProvider>
  );
}

function ThemePreferenceSync() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const appliedId = useRef<number | null>(null);
  const lastSent = useRef<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    if (!user) {
      appliedId.current = null;
      lastSent.current = null;
      return;
    }
    if (appliedId.current === user.id) return;
    appliedId.current = user.id;
    if (isThemePreference(user.theme_preference)) {
      lastSent.current = user.theme_preference;
      if (theme !== user.theme_preference) setTheme(user.theme_preference);
    } else {
      lastSent.current = isThemePreference(theme) ? theme : null;
    }
  }, [mounted, user, theme, setTheme]);

  useEffect(() => {
    if (!mounted || !user || !isThemePreference(theme)) return;
    if (appliedId.current !== user.id) return;
    if (theme === lastSent.current) return;
    lastSent.current = theme;
    persistUserThemeLocal(user.id, theme);
    void api.auth.updateTheme(theme).catch(() => {
      lastSent.current = null;
    });
  }, [mounted, theme, user]);

  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            gcTime: 5 * 60 * 1000,
            refetchOnMount: true,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <UserThemeProvider>
          <LeadNotificationsProvider>{children}</LeadNotificationsProvider>
          <HelpAssistant />
          <Toaster />
        </UserThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
