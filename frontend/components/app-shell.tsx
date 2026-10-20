'use client';

import type { ReactNode } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { EmailDialog } from '@/components/email-dialog';
import { ThemeToggle } from '@/components/theme-toggle';
import { AppSidebar } from '@/components/app-sidebar';
import { ADMIN_NAV_SECTIONS, filterAdminNavSections } from '@/lib/admin-nav';
import { LogOut, Menu, X } from 'lucide-react';
import { CompanyBrand } from '@/components/company-brand';
import { CompanySwitcher } from '@/components/company-switcher';
import { AlertsPanel } from '@/components/alerts-panel';
import { usePathname } from 'next/navigation';
import { useMemo, useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useModulePathGuard } from '@/components/module-guard';
import { api } from '@/lib/api';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import { TrialBanner } from '@/components/trial-banner';
import { usePlatformPermissions } from '@/hooks/use-platform-permissions';
import { usePersistedScroll } from '@/hooks/use-persisted-scroll';
import { ControlOpsAssistant } from '@/components/assistant/controlops-assistant';
import { ReportIssueDialog } from '@/components/feedback/report-issue-dialog';
import { QuickActionsMenu } from '@/components/quick-actions-menu';
import { GlobalSearch } from '@/components/global-search';
import { AdminSidebarNav, TenantSidebarNav } from '@/components/sidebar-nav';
import { groupTenantNavSections } from '@/lib/sidebar-sections';

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const tc = useTranslations('common');
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportExtras, setReportExtras] = useState<Record<string, unknown> | null>(null);
  const isSuperAdmin = user?.role === 'super_admin';
  const { can, loaded: permsLoaded } = usePlatformPermissions();
  const mobileNavRef = usePersistedScroll<HTMLElement>('app-sidebar-nav-mobile');

  useEffect(() => {
    const onReport = (ev: Event) => {
      const detail = (ev as CustomEvent<Record<string, unknown>>).detail || null;
      setReportExtras(detail);
      setReportOpen(true);
    };
    window.addEventListener('controlops-report-issue', onReport as EventListener);
    return () => window.removeEventListener('controlops-report-issue', onReport as EventListener);
  }, []);

  useEffect(() => {
    if (!drawer) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawer(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [drawer]);

  useEffect(() => {
    setDrawer(false);
  }, [pathname]);

  const adminSections = useMemo(
    () =>
      permsLoaded
        ? filterAdminNavSections(can)
        : ADMIN_NAV_SECTIONS.map((s) => ({ titleKey: s.titleKey, items: [...s.items] })),
    [can, permsLoaded]
  );
  const tenantSections = useMemo(() => groupTenantNavSections(user), [user]);
  const queryClient = useQueryClient();
  useModulePathGuard(pathname);

  useEffect(() => {
    if (!user) return;
    if (isSuperAdmin) {
      void queryClient.prefetchQuery({
        queryKey: ['admin-dashboard'],
        queryFn: () => api.admin.dashboard(),
        staleTime: 60_000,
      });
      return;
    }
    void queryClient.prefetchQuery({
      queryKey: ['dashboard-overview'],
      queryFn: () => api.reports.dashboard(),
      staleTime: 60_000,
    });
    void queryClient.prefetchQuery({
      queryKey: ['dashboard-alerts', 30],
      queryFn: async () => {
        const [compliance, contracts] = await Promise.all([
          api.reports.compliance(30),
          api.reports.contractsExpiring(30),
        ]);
        return { compliance, contracts };
      },
      staleTime: 60_000,
    });
  }, [user, isSuperAdmin, queryClient]);

  return (
    <div className="flex h-[100vh] h-dvh overflow-hidden bg-background">
      <AppSidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <ImpersonationBanner />
        <TrialBanner />
        <header className="app-header-safe z-40 flex min-h-12 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-3 dark:bg-card">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden md:hidden">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={tc('menu')}
              aria-expanded={drawer}
              aria-controls="app-mobile-nav"
              className="shrink-0 transition-colors hover:bg-primary/10 hover:text-primary"
              onClick={() => setDrawer(true)}
            >
              <Menu className="size-5" />
            </Button>
            <CompanyBrand className="min-w-0 text-primary text-sm [&_span]:text-primary" />
          </div>
          <div className="flex shrink-0 items-center md:flex-1 md:justify-center md:px-4">
            <GlobalSearch className="w-auto md:w-full md:max-w-sm" />
          </div>
          <div className="flex shrink-0 items-center gap-1 overflow-visible py-1 sm:gap-1.5 [&_button]:transition-colors [&_button:hover]:border-primary/30 [&_button:hover]:bg-primary/10 [&_button:hover]:text-primary">
            <QuickActionsMenu />
            <LanguageSwitcher />
            <ThemeToggle />
            <AlertsPanel />
            <EmailDialog />
            <Button
              variant="outline"
              size="sm"
              aria-label={tc('logout')}
              title={tc('logout')}
              className="px-2.5 sm:px-3"
              onClick={() => void logout()}
            >
              <LogOut className="size-4 sm:hidden" />
              <span className="sr-only sm:not-sr-only">{tc('logout')}</span>
            </Button>
          </div>
        </header>
        {drawer ? (
          <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label={tc('menu')}>
            <button
              type="button"
              className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
              aria-label={tc('closeMenu')}
              onClick={() => setDrawer(false)}
            />
            <div
              id="app-mobile-nav"
              className="app-drawer-safe absolute start-0 top-0 bottom-0 flex w-[min(20rem,88vw)] max-w-full flex-col border-e border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl"
            >
              <div className="flex shrink-0 flex-col gap-2 border-b border-sidebar-border px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <CompanyBrand className="min-w-0" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-sidebar-foreground/70 hover:text-sidebar-foreground"
                    aria-label={tc('closeMenu')}
                    onClick={() => setDrawer(false)}
                  >
                    <X className="size-5" />
                  </Button>
                </div>
                <CompanySwitcher />
              </div>
              <nav
                ref={mobileNavRef}
                aria-label="Main"
                className="sidebar-nav-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-2.5 [-webkit-overflow-scrolling:touch]"
              >
                {isSuperAdmin ? (
                  <AdminSidebarNav sections={adminSections} onNavigate={() => setDrawer(false)} compact={false} />
                ) : (
                  <TenantSidebarNav sections={tenantSections} onNavigate={() => setDrawer(false)} compact={false} />
                )}
              </nav>
            </div>
          </div>
        ) : null}
        <main className="app-main-safe flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
          {children}
        </main>
        {user ? <ControlOpsAssistant /> : null}
        {user && !isSuperAdmin ? (
          <ReportIssueDialog
            open={reportOpen}
            onOpenChange={setReportOpen}
            defaultCategory={String(reportExtras?.error_category || 'technical_issue')}
            defaultSubject={String(reportExtras?.subject || 'Application issue')}
            defaultDescription={String(reportExtras?.description || '')}
            diagnosticExtras={reportExtras}
          />
        ) : null}
      </div>
    </div>
  );
}
