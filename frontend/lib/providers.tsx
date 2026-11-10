'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, useTheme } from 'next-themes';
import { usePathname } from 'next/navigation';
import { ReactNode, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { AuthProvider, useAuth } from '@/contexts/auth-context';
import { LeadNotificationsProvider } from '@/components/lead-notifications-provider';
import { HelpAssistant } from '@/components/help/help-assistant';
import { Toaster } from '@/components/ui/sonner';
import { GaBootstrap } from '@/components/analytics/ga-bootstrap';
import { CookieConsentBanner } from '@/components/analytics/cookie-consent-banner';
import { GaPageViews } from '@/components/analytics/ga-page-views';
import { api } from '@/lib/api';
import {
  bindUserTheme,
  clearActiveThemeUser,
  isPublicThemePath,
  isThemePreference,
  persistPublicThemeLocal,
  persistUserThemeLocal,
  resolveThemeStorageKey,
} from '@/lib/user-theme';

/**
 * Keeps next-themes' own inline script from executing. The server can't read localStorage,
 * so it renders that script with the public key; on app routes it then overwrites the
 * correct theme set by THEME_INIT_SCRIPT, flashing the wrong theme until hydration.
 */
const INERT_THEME_SCRIPT_PROPS = { type: 'text/plain' };

function UserThemeProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const storageKey = useMemo(
    () =>
      resolveThemeStorageKey({
        pathname,
        userId: user?.id,
        loading,
      }),
    [pathname, user?.id, loading]
  );

  const userId = user?.id ?? null;

  useEffect(() => {
    if (loading) return;
    if (user) bindUserTheme(user);
    else clearActiveThemeUser();
  }, [loading, userId]);

  return (
    // Remount when the storage scope changes (public ↔ user, or user A ↔ user B)
    // so one preference never leaks into another localStorage key / session.
    <ThemeProvider
      key={storageKey}
      storageKey={storageKey}
      attribute="class"
      defaultTheme="system"
      enableSystem
      enableColorScheme
      disableTransitionOnChange
      scriptProps={INERT_THEME_SCRIPT_PROPS}
    >
      <ThemePreferenceSync storageKey={storageKey} />
      {children}
    </ThemeProvider>
  );
}

function ThemePreferenceSync({ storageKey }: { storageKey: string }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const appliedId = useRef<number | null>(null);
  const lastSent = useRef<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const onPublicSite = isPublicThemePath(pathname);

  useEffect(() => setMounted(true), []);

  // Apply the signed-in user's saved preference when entering the app shell.
  // Never adopt the previous session's theme into a user with no preference.
  useEffect(() => {
    if (!mounted || onPublicSite) return;
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
      lastSent.current = 'system';
      if (theme !== 'system') setTheme('system');
    }
  }, [mounted, user, theme, setTheme, onPublicSite]);

  // Persist changes: user account on app routes, public key on marketing/auth routes.
  useEffect(() => {
    if (!mounted || !isThemePreference(theme)) return;

    if (onPublicSite) {
      persistPublicThemeLocal(theme);
      return;
    }

    if (!user) return;
    if (appliedId.current !== user.id) return;
    if (theme === lastSent.current) return;
    lastSent.current = theme;
    persistUserThemeLocal(user.id, theme);
    void api.auth.updateTheme(theme).catch(() => {
      lastSent.current = null;
    });
  }, [mounted, theme, user, onPublicSite, storageKey]);

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
          <GaBootstrap />
          <Suspense fallback={null}>
            <GaPageViews />
          </Suspense>
          <CookieConsentBanner />
        </UserThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
