export const TENANT_LOGIN_PATH = '/login';
export const SUPER_ADMIN_LOGIN_PATH = '/secret/admin/login';

export function loginPathForSession(opts?: { role?: string | null; pathname?: string }): string {
  const role = (opts?.role || '').toLowerCase();
  const path =
    opts?.pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '');
  if (role === 'super_admin' || path.startsWith('/admin') || path.startsWith('/secret/admin')) {
    return SUPER_ADMIN_LOGIN_PATH;
  }
  return TENANT_LOGIN_PATH;
}
