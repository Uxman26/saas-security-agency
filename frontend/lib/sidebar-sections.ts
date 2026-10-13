import type { ModuleAccess, User } from './types';
import { moduleNavAllowed } from './nav-modules';

export const TENANT_SECTION_ORDER = [
  'sectionOverview',
  'sectionHr',
  'sectionScheduling',
  'sectionField',
  'sectionSafety',
  'sectionSales',
  'sectionFinance',
  'sectionReports',
  'sectionSettings',
  'sectionOperations',
] as const;

export type TenantNavSection = {
  titleKey: string;
  items: ModuleAccess[];
};

export function groupTenantNavSections(user: User | null | undefined): TenantNavSection[] {
  const access = user?.module_access;
  if (!access?.length) return [];
  const bySection: Record<string, ModuleAccess[]> = {};
  for (const m of access) {
    if (!moduleNavAllowed(user, m)) continue;
    const sec = m.section_key || 'sectionOperations';
    if (!bySection[sec]) bySection[sec] = [];
    bySection[sec].push(m);
  }
  return TENANT_SECTION_ORDER.filter((sec) => bySection[sec]?.length).map((sec) => ({
    titleKey: sec,
    items: bySection[sec].sort((a, b) => a.sidebar_order - b.sidebar_order),
  }));
}

export function isNavPathActive(pathname: string, href: string) {
  if (href === '/dashboard' || href === '/admin') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
