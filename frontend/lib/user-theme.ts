import { TOKEN_KEY } from '@/lib/session-sync';
import { storageGet, storageRemove, storageSet } from '@/lib/safe-storage';

/** Public / marketing site theme (never written by a logged-in dashboard session). */
export const THEME_PUBLIC_KEY = 'theme-public';
/** @deprecated Legacy public key — still read for migration. */
export const THEME_GUEST_KEY = 'theme-guest';
export const THEME_USER_PREFIX = 'theme-user-';
export const THEME_ACTIVE_USER_KEY = 'theme-active-user';
const LEGACY_THEME_KEY = 'theme';

export type ThemePreference = 'light' | 'dark' | 'system';

/** Marketing, auth, and legal routes that keep an independent public theme. */
const PUBLIC_THEME_PREFIXES = [
  '/about',
  '/accessibility',
  '/auth/callback',
  '/book-demo',
  '/contact',
  '/cookies',
  '/dpa',
  '/forgot-password',
  '/industries',
  '/login',
  '/payment-pending',
  '/platform',
  '/pricing',
  '/privacy',
  '/reset-password',
  '/secret/admin/login',
  '/security',
  '/signup',
  '/terms',
  '/verify-email',
] as const;

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function themeStorageKey(userId?: number | string | null): string {
  return userId != null && String(userId) !== '' ? `${THEME_USER_PREFIX}${userId}` : THEME_PUBLIC_KEY;
}

/**
 * True for the public-facing website (and signed-out auth pages).
 * Dashboard / portal / super-admin app chrome uses the signed-in user's theme instead.
 */
export function isPublicThemePath(pathname: string | null | undefined): boolean {
  if (!pathname) return true;
  const path = pathname.split('?')[0] || '/';
  if (path === '/') return true;
  return PUBLIC_THEME_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function readActiveThemeUserId(): string | null {
  if (typeof window === 'undefined') return null;
  if (!storageGet(TOKEN_KEY)) return null;
  return storageGet(THEME_ACTIVE_USER_KEY);
}

/** Resolve which localStorage key next-themes should use for this screen. */
export function resolveThemeStorageKey(options: {
  pathname?: string | null;
  userId?: number | string | null;
  loading?: boolean;
}): string {
  if (isPublicThemePath(options.pathname)) return THEME_PUBLIC_KEY;
  if (options.userId != null && String(options.userId) !== '') {
    return themeStorageKey(options.userId);
  }
  if (options.loading) {
    const active = readActiveThemeUserId();
    if (active) return themeStorageKey(active);
  }
  return THEME_PUBLIC_KEY;
}

/** Read the public site preference, honouring older guest/legacy keys. */
export function readPublicThemePreference(): ThemePreference | null {
  const raw =
    storageGet(THEME_PUBLIC_KEY) || storageGet(THEME_GUEST_KEY) || storageGet(LEGACY_THEME_KEY);
  return isThemePreference(raw) ? raw : null;
}

export function persistPublicThemeLocal(theme: ThemePreference) {
  if (typeof window === 'undefined') return;
  storageSet(THEME_PUBLIC_KEY, theme);
}

export function persistUserThemeLocal(userId: number, theme: ThemePreference) {
  if (typeof window === 'undefined') return;
  // User preference only — never touch the public website key.
  storageSet(themeStorageKey(userId), theme);
}

export function bindUserTheme(user: { id: number; theme_preference?: string | null }) {
  if (typeof window === 'undefined') return;
  const userKey = themeStorageKey(user.id);
  if (!storageGet(userKey)) {
    const legacy = storageGet(LEGACY_THEME_KEY);
    if (isThemePreference(legacy)) storageSet(userKey, legacy);
  }
  // Prefer the account preference from the API when present.
  if (isThemePreference(user.theme_preference)) {
    storageSet(userKey, user.theme_preference);
  }
  storageSet(THEME_ACTIVE_USER_KEY, String(user.id));
}

export function clearActiveThemeUser() {
  if (typeof window === 'undefined') return;
  storageRemove(THEME_ACTIVE_USER_KEY);
}

/** Inline copy of {@link isPublicThemePath} for the blocking head script. */
const PUBLIC_PREFIXES_SCRIPT = PUBLIC_THEME_PREFIXES.map((p) => JSON.stringify(p)).join(',');

/**
 * Blocking head script: apply the correct theme before first paint.
 *
 * - Public routes → `theme-public` (legacy guest/theme fallbacks)
 * - Signed-in app routes → `theme-user-{id}`
 * Never copies a dashboard preference into the public key.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var path=(location.pathname||'/').split('?')[0]||'/';var prefixes=[${PUBLIC_PREFIXES_SCRIPT}];var isPublic=path==='/'||prefixes.some(function(p){return path===p||path.indexOf(p+'/')===0});var token=localStorage.getItem('token');var active=token?localStorage.getItem('${THEME_ACTIVE_USER_KEY}'):null;var key=(!isPublic&&active)?'${THEME_USER_PREFIX}'+active:'${THEME_PUBLIC_KEY}';if(key==='${THEME_PUBLIC_KEY}'&&!localStorage.getItem('${THEME_PUBLIC_KEY}')){var legacy=localStorage.getItem('${THEME_GUEST_KEY}')||localStorage.getItem('${LEGACY_THEME_KEY}');if(legacy==='light'||legacy==='dark'||legacy==='system'){try{localStorage.setItem('${THEME_PUBLIC_KEY}',legacy)}catch(e){}}}var pref=localStorage.getItem(key);if(!pref&&key==='${THEME_PUBLIC_KEY}'){pref=localStorage.getItem('${THEME_GUEST_KEY}')||localStorage.getItem('${LEGACY_THEME_KEY}')}var systemDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var dark=pref==='dark'||((pref==='system'||!pref)&&systemDark);var root=document.documentElement;if(dark){root.classList.add('dark');root.style.colorScheme='dark'}else{root.classList.remove('dark');root.style.colorScheme='light'}}catch(e){}})();`;
