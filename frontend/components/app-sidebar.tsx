'use client';

import { useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { CompanyBrand } from '@/components/company-brand';
import { AdminSidebarNav, TenantSidebarNav } from '@/components/sidebar-nav';
import { ADMIN_NAV_SECTIONS, filterAdminNavSections } from '@/lib/admin-nav';
import { groupTenantNavSections } from '@/lib/sidebar-sections';
import { usePlatformPermissions } from '@/hooks/use-platform-permissions';
import { usePersistedScroll } from '@/hooks/use-persisted-scroll';

const asideClass =
  'hidden h-[100vh] h-dvh min-h-0 w-56 shrink-0 flex-col overflow-hidden border-e border-sidebar-border bg-sidebar text-sidebar-foreground md:flex';

export function AppSidebar() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const { can, loaded } = usePlatformPermissions();
  const navRef = usePersistedScroll<HTMLElement>('app-sidebar-nav');
  const adminSections = useMemo(
    () => (loaded ? filterAdminNavSections(can) : ADMIN_NAV_SECTIONS.map((s) => ({ titleKey: s.titleKey, items: [...s.items] }))),
    [can, loaded]
  );
  const tenantSections = useMemo(() => groupTenantNavSections(user), [user]);

  return (
    <aside className={asideClass}>
      <div className="shrink-0 border-b border-sidebar-border px-3 py-3.5">
        <CompanyBrand />
      </div>
      <nav
        ref={navRef}
        aria-label="Main"
        className="sidebar-nav-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
      >
        {isSuperAdmin ? (
          <AdminSidebarNav sections={adminSections} compact />
        ) : (
          <TenantSidebarNav sections={tenantSections} compact />
        )}
      </nav>
    </aside>
  );
}
