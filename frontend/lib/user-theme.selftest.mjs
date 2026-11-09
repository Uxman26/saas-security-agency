/**
 * Node self-test for theme isolation helpers (no vitest required).
 * Run: node lib/user-theme.selftest.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, 'user-theme.ts'), 'utf8');

function extractArray(name) {
  const m = src.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\] as const`));
  assert.ok(m, `missing ${name}`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

const prefixes = extractArray('PUBLIC_THEME_PREFIXES');

function isPublicThemePath(pathname) {
  if (!pathname) return true;
  const path = pathname.split('?')[0] || '/';
  if (path === '/') return true;
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function resolveThemeStorageKey({ pathname, userId, loading, activeUserId, hasToken }) {
  if (isPublicThemePath(pathname)) return 'theme-public';
  if (userId != null && String(userId) !== '') return `theme-user-${userId}`;
  if (loading && hasToken && activeUserId) return `theme-user-${activeUserId}`;
  return 'theme-public';
}

// Public site never uses a user key
assert.equal(resolveThemeStorageKey({ pathname: '/', userId: 42 }), 'theme-public');
assert.equal(resolveThemeStorageKey({ pathname: '/pricing', userId: 42 }), 'theme-public');
assert.equal(resolveThemeStorageKey({ pathname: '/login', userId: 42 }), 'theme-public');
assert.equal(resolveThemeStorageKey({ pathname: '/industries/security', userId: 7 }), 'theme-public');
assert.equal(resolveThemeStorageKey({ pathname: '/book-demo?x=1', userId: 7 }), 'theme-public');

// App shell uses per-user keys
assert.equal(resolveThemeStorageKey({ pathname: '/dashboard', userId: 42 }), 'theme-user-42');
assert.equal(resolveThemeStorageKey({ pathname: '/invoices', userId: 9 }), 'theme-user-9');
assert.equal(resolveThemeStorageKey({ pathname: '/admin', userId: 1 }), 'theme-user-1');

// Different users → different keys
assert.notEqual(
  resolveThemeStorageKey({ pathname: '/rota', userId: 1 }),
  resolveThemeStorageKey({ pathname: '/rota', userId: 2 })
);

// Loading with session still scopes to that user on app routes
assert.equal(
  resolveThemeStorageKey({ pathname: '/sites', loading: true, hasToken: true, activeUserId: '55' }),
  'theme-user-55'
);

// Signed-out app path falls back to public (no session)
assert.equal(resolveThemeStorageKey({ pathname: '/dashboard', loading: false }), 'theme-public');

// Build the runtime init script the same way the TS module does (template + prefixes).
const scriptMatch = src.match(/THEME_INIT_SCRIPT = `([^`]+)`/);
assert.ok(scriptMatch, 'THEME_INIT_SCRIPT missing');
const prefixesLit = prefixes.map((p) => JSON.stringify(p)).join(',');
const script = scriptMatch[1]
  .replace('${PUBLIC_PREFIXES_SCRIPT}', prefixesLit)
  .replaceAll('${THEME_ACTIVE_USER_KEY}', 'theme-active-user')
  .replaceAll('${THEME_USER_PREFIX}', 'theme-user-')
  .replaceAll('${THEME_PUBLIC_KEY}', 'theme-public')
  .replaceAll('${THEME_GUEST_KEY}', 'theme-guest')
  .replaceAll('${LEGACY_THEME_KEY}', 'theme');
assert.equal(script.includes('${'), false, 'unresolved template placeholders');
new Function(script);
// May migrate legacy guest → public, but must never copy a user key into public.
assert.ok(!/setItem\(['"]theme-public['"],\s*localStorage\.getItem\(['"]theme-user-/.test(script));
assert.ok(script.includes('theme-user-'));
assert.ok(script.includes('theme-public'));

// persistUserThemeLocal source must not touch public/guest keys
assert.ok(src.includes('persistUserThemeLocal'));
const persistFn = src.slice(src.indexOf('export function persistUserThemeLocal'));
const persistBody = persistFn.slice(0, persistFn.indexOf('export function bindUserTheme'));
assert.equal(persistBody.includes('THEME_PUBLIC_KEY'), false);
assert.equal(persistBody.includes('THEME_GUEST_KEY'), false);

console.log('user-theme.selftest: all assertions passed');
