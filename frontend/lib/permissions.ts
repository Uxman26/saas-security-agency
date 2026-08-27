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

/** Coarse actions every module has; granular keys (e.g. 'publish') are also accepted. */
export type ModuleAction = 'view' | 'create' | 'edit' | 'delete' | (string & {});

/**
 * Fallback parents for granular actions, mirroring `parent` in the backend's
 * app/module_actions.py catalogue.
 *
 * The server is the source of truth and ships each module's `actions` map on
 * /auth/me, so this is only consulted when a granular key is absent from that map —
 * a user whose session predates the action, or a module the catalogue has since
 * extended. Keys are `module.action`.
 */
const ACTION_PARENTS: Record<string, string> = {
  publish: 'edit',
  unpublish: 'edit',
  unpublish_guard: 'edit',
  copy_plan: 'create',
  approve: 'edit',
  reject: 'edit',
  export: 'view',
  send: 'edit',
  test: 'edit',
  status_change: 'edit',
  assign: 'edit',
  unassign: 'edit',
  convert: 'edit',
  deactivate: 'delete',
  duplicate: 'create',
  generate: 'create',
  calculate: 'edit',
  calculate_batch: 'edit',
  renew: 'edit',
  scan: 'edit',
  scan_photo: 'edit',
  seed_uk: 'create',
  bulk_create: 'create',
  create_with_images: 'create',
  logo_upload: 'edit',
  profile_edit: 'edit',
  upload: 'create',
  download: 'view',
  reports: 'view',
};

function fallbackAction(action: string): string | null {
  if (ACTION_PARENTS[action]) return ACTION_PARENTS[action];
  if (action.endsWith('_view') || action.endsWith('_reports')) return 'view';
  if (action.endsWith('_create') || action.endsWith('_upload')) return 'create';
  if (action.endsWith('_delete')) return 'delete';
  if (action.endsWith('_edit') || action.endsWith('_manage')) return 'edit';
  return null;
}

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

  const resolve = (act: string, depth = 0): boolean | null => {
    if (depth > 8) return null;
    const mod = user.module_access?.find((m) => m.key === moduleKey);
    // module_access.actions is the exact per-action answer and must be consulted
    // before the flat permissions list. That list mixes granular module.action codes
    // with the API's legacy PERM_* strings, and fourteen of those were named in the
    // same namespace — 'rota.edit', 'patrol.scan', 'leads.export', 'guards.delete'…
    // A legacy code is emitted whenever a *descendant* action is granted, so checking
    // the list first let rota.publish light up every Edit control on the rota for a
    // role whose Edit tickbox was off.
    if (mod?.actions && act in mod.actions) return mod.actions[act];
    if (Array.isArray(user.permissions) && user.permissions.includes(`${moduleKey}.${act}`)) {
      return true;
    }
    if (mod) {
      if (act === 'view') return mod.can_view;
      if (act === 'create') return mod.can_create;
      if (act === 'edit') return mod.can_edit;
      if (act === 'delete') return mod.can_delete;
    }
    const parent = fallbackAction(act);
    return parent ? resolve(parent, depth + 1) : null;
  };

  return resolve(action) === true;
}

export function isTenantAdmin(user: User | null | undefined): boolean {
  if (!user) return false;
  const r = (user.role || '').toLowerCase().trim();
  return r === 'admin' || r === 'company_admin';
}

/** Mirrors portal_access.is_portal_role on the API: the two outward-facing roles. */
export function isPortalRole(user: User | null | undefined): boolean {
  if (!user) return false;
  const r = (user.role || '').toLowerCase().trim();
  return r === 'client' || r === 'staff';
}
