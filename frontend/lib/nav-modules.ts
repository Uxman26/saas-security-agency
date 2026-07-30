import type { User, ModuleAccess } from './types';
import { sidebarPathAllowed } from './sidebar-modules';

export function moduleNavAllowed(user: User | null | undefined, m: ModuleAccess): boolean {
  if (!m.can_view) return false;
  if (!sidebarPathAllowed(user?.sidebar_modules, m.sidebar_path)) return false;
  if (m.key === 'expenses' && user?.enabled_modules && user.enabled_modules.expenses === false) return false;
  if (m.key === 'leads' && user?.enabled_modules && user.enabled_modules.leads === false) return false;
  if (m.key === 'sms' && user?.enabled_modules && user.enabled_modules.whatsapp === false) return false;
  if (m.key === 'email_settings' && user?.enabled_modules && user.enabled_modules.email === false) return false;
  return true;
}

export function navModulesFromUser(user: User | null | undefined): ModuleAccess[] {
  if (!user?.module_access?.length) return [];
  return user.module_access
    .filter((m) => moduleNavAllowed(user, m))
    .sort((a, b) => a.sidebar_order - b.sidebar_order);
}
