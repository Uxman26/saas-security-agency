'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { EmailDialog } from '@/components/email-dialog';
import { ThemeToggle } from '@/components/theme-toggle';
import { AppSidebar } from '@/components/app-sidebar';
import { Menu } from 'lucide-react';
import { CompanyBrand } from '@/components/company-brand';
import { AlertsPanel } from '@/components/alerts-panel';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from '@/components/language-switcher';
import { cn } from '@/lib/utils';
import { navModulesFromUser } from '@/lib/nav-modules';
import { useModulePathGuard } from '@/components/module-guard';

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
  const isSuperAdmin = user?.role === 'super_admin';
  useModulePathGuard(pathname);

  const links = useMemo(() => navModulesFromUser(user), [user]);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <AppSidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-40 flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-3 dark:bg-card">
          <div className="flex min-w-0 items-center gap-2 md:hidden">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 transition-colors hover:bg-primary/10 hover:text-primary"
              onClick={() => setDrawer(true)}
            >
              <Menu className="size-5" />
            </Button>
            <CompanyBrand className="text-primary text-sm [&_span]:text-primary" />
          </div>
          <div className="hidden flex-1 md:block" />
          <div className="flex shrink-0 items-center gap-1.5 [&_button]:transition-colors [&_button:hover]:border-primary/30 [&_button:hover]:bg-primary/10 [&_button:hover]:text-primary">
            <LanguageSwitcher />
            <ThemeToggle />
            <AlertsPanel />
            <EmailDialog />
            <Button variant="outline" size="sm" onClick={() => void logout()}>
              {tc('logout')}
            </Button>
          </div>
        </header>
        {drawer && (
          <div className="fixed inset-0 z-50 md:hidden">
            <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close menu" onClick={() => setDrawer(false)} />
            <div className="absolute start-0 top-0 bottom-0 flex w-56 flex-col border-e border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl">
              <div className="border-b border-sidebar-border p-4">
                <CompanyBrand className="mb-2" />
                <div className="flex justify-end">
                  <Button type="button" variant="ghost" size="sm" className="text-sidebar-foreground/70" onClick={() => setDrawer(false)}>
                    ✕
                  </Button>
                </div>
              </div>
              <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
                {isSuperAdmin ? (
                  [
                    { href: '/admin/companies', labelKey: 'adminCompanies' },
                    { href: '/admin/users', labelKey: 'adminUsers' },
                    { href: '/admin/admins', labelKey: 'adminAdmins' },
                    { href: '/admin/invoices', labelKey: 'adminInvoices' },
                    { href: '/admin/payments', labelKey: 'adminPayments' },
                    { href: '/admin/receipts', labelKey: 'adminReceipts' },
                    { href: '/admin/packages', labelKey: 'adminPackages' },
                    { href: '/admin/email', labelKey: 'adminSmtp' },
                    { href: '/admin/logs', labelKey: 'adminLogs' },
                  ].map(({ href, labelKey }) => (
                    <Link
                      key={href}
                      href={href}
                      className={cn(
                        'block rounded-lg px-3 py-2 text-sm transition-colors',
                        pathname === href
                          ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'
                      )}
                      onClick={() => setDrawer(false)}
                    >
                      {ts(labelKey)}
                    </Link>
                  ))
                ) : (
                  links.map((m) => (
                    <Link
                      key={m.key}
                      href={m.sidebar_path}
                      className={cn(
                        'block rounded-lg px-3 py-2 text-sm transition-colors',
                        mActive(pathname, m.sidebar_path)
                          ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'
                      )}
                      onClick={() => setDrawer(false)}
                    >
                      {m.name}
                    </Link>
                  ))
                )}
              </nav>
            </div>
          </div>
        )}
        <main className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain">{children}</main>
      </div>
    </div>
  );
}
