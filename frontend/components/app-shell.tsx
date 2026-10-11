'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { EmailDialog } from '@/components/email-dialog';
import { ThemeToggle } from '@/components/theme-toggle';
import { AppSidebar } from '@/components/app-sidebar';
import { ADMIN_NAV_SECTIONS, filterAdminNavSections, isAdminNavActive } from '@/lib/admin-nav';
import { LogOut, Menu } from 'lucide-react';
import { CompanyBrand } from '@/components/company-brand';
import { AlertsPanel } from '@/components/alerts-panel';
import { usePathname } from 'next/navigation';
import { useMemo, useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from '@/components/language-switcher';
import { cn } from '@/lib/utils';
import { navModulesFromUser } from '@/lib/nav-modules';
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
import { useModuleLabel } from '@/lib/module-i18n';

function mActive(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const tc = useTranslations('common');
  const ts = useTranslations('sidebar');
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

  const adminSections = useMemo(
    () =>
      permsLoaded
        ? filterAdminNavSections(can)
        : ADMIN_NAV_SECTIONS.map((s) => ({ titleKey: s.titleKey, items: [...s.items] })),
    [can, permsLoaded]
  );
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

  const links = useMemo(() => navModulesFromUser(user), [user]);
  const moduleLabel = useModuleLabel();

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
              className="shrink-0 transition-colors hover:bg-primary/10 hover:text-primary"
              onClick={() => setDrawer(true)}
            >
              <Menu className="size-5" />
            </Button>
            <CompanyBrand className="min-w-0 truncate text-primary text-sm [&_span]:truncate [&_span]:text-primary" />
          </div>
          <div className="flex shrink-0 items-center md:flex-1 md:justify-center md:px-4">
            <GlobalSearch className="w-auto md:w-full md:max-w-sm" />
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-1.5 [&_button]:transition-colors [&_button:hover]:border-primary/30 [&_button:hover]:bg-primary/10 [&_button:hover]:text-primary">
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
        {drawer && (
          <div className="fixed inset-0 z-50 md:hidden">
            <button type="button" className="absolute inset-0 bg-black/50" aria-label={tc('closeMenu')} onClick={() => setDrawer(false)} />
            <div className="app-drawer-safe absolute start-0 top-0 bottom-0 flex w-[min(18rem,85vw)] flex-col border-e border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl">
              <div className="border-b border-sidebar-border p-4">
                <CompanyBrand className="mb-2" />
                <div className="flex justify-end">
                  <Button type="button" variant="ghost" size="sm" className="text-sidebar-foreground/70" onClick={() => setDrawer(false)}>
                    ✕
                  </Button>
                </div>
              </div>
              <nav ref={mobileNavRef} className="sidebar-nav-scroll min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2 [-webkit-overflow-scrolling:touch]">
                {isSuperAdmin ? (
                  adminSections.map((section) => (
                    <div key={section.titleKey} className="mb-3">
                      <p className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                        {ts(section.titleKey)}
                      </p>
                      {section.items.map(({ href, labelKey }) => (
                        <Link
                          key={href}
                          href={href}
                          scroll={false}
                          className={cn(
                            'block rounded-e-lg border-s-[3px] border-transparent px-3 py-2 text-sm transition-colors',
                            isAdminNavActive(pathname, href)
                              ? 'border-s-sidebar-primary bg-sidebar-accent font-semibold text-sidebar-primary'
                              : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-primary'
                          )}
                          onClick={() => setDrawer(false)}
                        >
                          {ts(labelKey)}
                        </Link>
                      ))}
                    </div>
                  ))
                ) : (
                  links.map((m) => (
                    <Link
                      key={m.key}
                      href={m.sidebar_path}
                      scroll={false}
                      className={cn(
                        'block rounded-e-lg border-s-[3px] border-transparent px-3 py-2 text-sm transition-colors',
                        mActive(pathname, m.sidebar_path)
                          ? 'border-s-sidebar-primary bg-sidebar-accent font-semibold text-sidebar-primary'
                          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-primary'
                      )}
                      onClick={() => setDrawer(false)}
                    >
                      {moduleLabel(m.key, m.name)}
                    </Link>
                  ))
                )}
              </nav>
            </div>
          </div>
        )}
        <main className="app-main-safe flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">{children}</main>
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
