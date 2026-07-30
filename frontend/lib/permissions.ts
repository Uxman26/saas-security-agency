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
  patrolRead: 'patrol.read',
  patrolWrite: 'patrol.write',
  patrolScan: 'patrol.scan',
  patrolReports: 'patrol.reports',
  incidentRead: 'incident.read',
  incidentWrite: 'incident.write',
  incidentReports: 'incident.reports',
} as const;

export type ModuleAction = 'view' | 'create' | 'edit' | 'delete';

export function isAdminBypass(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  const r = (user.role || '').toLowerCase().trim();
  return r === 'admin' || r === 'company_admin';
}

export function can(user: User | null | undefined, code: string): boolean {
  if (!user) return false;
  if (isAdminBypass(user)) return true;
  return Array.isArray(user.permissions) && user.permissions.includes(code);
}

export function canModule(
  user: User | null | undefined,
  moduleKey: string,
  action: ModuleAction = 'view'
): boolean {
  if (!user) return false;
  if (isAdminBypass(user)) return true;
  const code = `${moduleKey}.${action}`;
  if (Array.isArray(user.permissions) && user.permissions.includes(code)) {
    return true;
  }
  const mod = user.module_access?.find((m) => m.key === moduleKey);
  if (!mod) return false;
  if (action === 'view') return mod.can_view;
  if (action === 'create') return mod.can_create;
  if (action === 'edit') return mod.can_edit;
  if (action === 'delete') return mod.can_delete;
  return false;
}

export function isTenantAdmin(user: User | null | undefined): boolean {
  if (!user) return false;
  const r = (user.role || '').toLowerCase().trim();
  return r === 'admin' || r === 'company_admin';
}
