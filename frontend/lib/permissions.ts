import type { User } from './types';

export const PERMS = {
  contractorView: 'contractor:view',
  contractorManage: 'contractor:manage',
  contractorAssign: 'contractor:assign',
  portalSites: 'portal.sites.read',
  portalRotaCurrent: 'portal.rota.current',
  portalRotaUpcoming: 'portal.rota.upcoming',
  portalRotaPrevious: 'portal.rota.previous',
  portalHours: 'portal.hours.read',
} as const;

export function can(user: User | null | undefined, code: string): boolean {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  return Array.isArray(user.permissions) && user.permissions.includes(code);
}

export function isTenantAdmin(user: User | null | undefined): boolean {
  if (!user) return false;
  const r = (user.role || '').toLowerCase().trim();
  return r === 'admin' || r === 'company_admin';
}
