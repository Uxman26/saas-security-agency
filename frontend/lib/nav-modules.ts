import type { User, ModuleAccess } from './types';
import { sidebarPathAllowed } from './sidebar-modules';

/** Permission-only modules gate a capability inside another screen and have no page. */
export function isCapabilityModule(m: ModuleAccess): boolean {
  return !m.sidebar_path || !m.sidebar_path.startsWith('/');
}

export function moduleNavAllowed(user: User | null | undefined, m: ModuleAccess): boolean {
  if (!m.can_view) return false;
  if (isCapabilityModule(m)) return false;
  if (!sidebarPathAllowed(user?.sidebar_modules, m.sidebar_path)) return false;
  const mods = user?.enabled_modules;
  if (mods) {
    if (m.key === 'expenses' && mods.expenses === false) return false;
    if (m.key === 'leads' && mods.leads === false) return false;
    if (m.key === 'sms' && mods.whatsapp === false) return false;
    if (m.key === 'email_settings' && mods.email === false) return false;
    if (m.key === 'client_portal' && mods.client_portal === false) return false;
  }
  const feats = user?.plan?.features;
  if (feats) {
    if (m.key === 'contractors' && feats.contractors === false) return false;
    if (m.key === 'sub_contractors' && feats.sub_contractors === false && feats.subcontractors === false) return false;
  }
  return true;
}

export function navModulesFromUser(user: User | null | undefined): ModuleAccess[] {
  if (!user?.module_access?.length) return [];
  return user.module_access
    .filter((m) => moduleNavAllowed(user, m))
    .sort((a, b) => a.sidebar_order - b.sidebar_order);
}

/** Where a role's "home" is. Super admins land in Platform HQ, portal roles in their portal. */
export function homePathForRole(role: string | null | undefined): string {
  const r = (role || '').toLowerCase();
  if (r === 'super_admin') return '/admin';
  if (r === 'client' || r === 'staff') return '/my-portal';
  return '/dashboard';
}
