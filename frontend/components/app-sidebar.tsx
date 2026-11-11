'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { CompanyBrand } from '@/components/company-brand';
import { CompanySwitcher } from '@/components/company-switcher';
import { AdminSidebarNav, TenantSidebarNav } from '@/components/sidebar-nav';
import { filterAdminNavSections } from '@/lib/admin-nav';
import { groupTenantNavSections } from '@/lib/sidebar-sections';
import { usePlatformPermissions } from '@/hooks/use-platform-permissions';
import { usePersistedScroll } from '@/hooks/use-persisted-scroll';
import { useDashboardOverview } from '@/hooks/use-dashboard';
import { storageGet, storageSet } from '@/lib/safe-storage';
import { cn } from '@/lib/utils';

const RAIL_KEY = 'controlops-sidebar-rail';
const railListeners = new Set<() => void>();
const subscribeRail = (cb: () => void) => {
  railListeners.add(cb);
  return () => {
    railListeners.delete(cb);
  };
};

function useRail() {
  const rail = useSyncExternalStore(subscribeRail, () => storageGet(RAIL_KEY) === '1', () => false);
  const toggle = useCallback(() => {
    storageSet(RAIL_KEY, rail ? '0' : '1');
    railListeners.forEach((l) => l());
  }, [rail]);
  return { rail, toggle };
}

function Profile({ rail }: { rail: boolean }) {
  const { user } = useAuth();
  if (!user) return null;
  const parts = (user.full_name || user.email).trim().split(/\s+/);
  const initials = ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  const role = (user.role || '').replace(/_/g, ' ');
  return (
    <div className={cn('flex items-center gap-2.5 rounded-xl', rail ? 'justify-center' : 'bg-sidebar-accent/40 p-2.5')} title={rail ? user.full_name : undefined}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-xs font-semibold text-white shadow-sm">
        {initials}
      </span>
      {rail ? null : (
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight">{user.full_name}</p>
          <p className="truncate text-[11px] capitalize leading-tight text-sidebar-foreground/60">{role || user.email}</p>
          <CompanySwitcher className="mt-0.5 px-0 [&_p]:text-[10px]" />
        </div>
      )}
    </div>
  );
}

export function AppSidebar() {
  const { user } = useAuth();
  const t = useTranslations('dashboard.shell');
  const isSuperAdmin = user?.role === 'super_admin';
  const { can } = usePlatformPermissions();
  const navRef = usePersistedScroll<HTMLElement>('app-sidebar-nav');
  const { rail, toggle } = useRail();
  const { data } = useDashboardOverview(false);
  // Items appear once permissions are known, never before, so the nav does not shrink after load.
  const adminSections = useMemo(() => filterAdminNavSections(can), [can]);
  const tenantSections = useMemo(() => groupTenantNavSections(user), [user]);
  const badges = useMemo(
    () => (data ? { documents: data.stats.expiring_documents, guards: data.stats.sia_expiring_30d } : undefined),
    [data]
  );

  return (
    <aside
      className={cn(
        'hidden h-[100vh] h-dvh min-h-0 shrink-0 flex-col overflow-hidden border-e border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-300 ease-out md:flex',
        rail ? 'w-[4.5rem]' : 'w-64'
      )}
    >
      <div className={cn('flex shrink-0 items-start gap-2 border-b border-sidebar-border py-3.5', rail ? 'flex-col items-center px-2' : 'px-3')}>
        {rail ? null : <CompanyBrand className="min-w-0 flex-1" />}
        <button
          type="button"
          onClick={toggle}
          aria-label={rail ? t('expand') : t('collapse')}
          title={rail ? t('expand') : t('collapse')}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          {rail ? <PanelLeftOpen className="size-4 rtl:-scale-x-100" /> : <PanelLeftClose className="size-4 rtl:-scale-x-100" />}
        </button>
      </div>
      <nav
        ref={navRef}
        aria-label="Main"
        className={cn('sidebar-nav-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain', rail ? 'px-2 py-3' : 'p-2')}
      >
        {isSuperAdmin ? (
          <AdminSidebarNav sections={adminSections} compact rail={rail} />
        ) : (
          <TenantSidebarNav sections={tenantSections} compact rail={rail} badges={badges} />
        )}
      </nav>
      <div className={cn('shrink-0 border-t border-sidebar-border', rail ? 'p-2 py-3' : 'p-2.5')}>
        <Profile rail={rail} />
      </div>
    </aside>
  );
}
