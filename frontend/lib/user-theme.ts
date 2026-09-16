import { TOKEN_KEY } from '@/lib/session-sync';

export const THEME_GUEST_KEY = 'theme-guest';
export const THEME_USER_PREFIX = 'theme-user-';
export const THEME_ACTIVE_USER_KEY = 'theme-active-user';
const LEGACY_THEME_KEY = 'theme';

export type ThemePreference = 'light' | 'dark' | 'system';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function themeStorageKey(userId?: number | string | null): string {
  return userId != null && String(userId) !== '' ? `${THEME_USER_PREFIX}${userId}` : THEME_GUEST_KEY;
}

export function readActiveThemeUserId(): string | null {
  if (typeof window === 'undefined') return null;
  if (!localStorage.getItem(TOKEN_KEY)) return null;
  return localStorage.getItem(THEME_ACTIVE_USER_KEY);
}

export function persistUserThemeLocal(userId: number, theme: ThemePreference) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(themeStorageKey(userId), theme);
}

export function bindUserTheme(user: { id: number; theme_preference?: string | null }) {
  if (typeof window === 'undefined') return;
  const userKey = themeStorageKey(user.id);
  if (!localStorage.getItem(userKey)) {
    const legacy = localStorage.getItem(LEGACY_THEME_KEY);
    if (isThemePreference(legacy)) localStorage.setItem(userKey, legacy);
  }
  localStorage.removeItem(LEGACY_THEME_KEY);
  if (isThemePreference(user.theme_preference)) {
    localStorage.setItem(userKey, user.theme_preference);
  }
  localStorage.setItem(THEME_ACTIVE_USER_KEY, String(user.id));
}

export function clearActiveThemeUser() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(THEME_ACTIVE_USER_KEY);
}
