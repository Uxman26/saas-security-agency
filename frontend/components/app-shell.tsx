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
import { can } from '@/lib/permissions';
import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from '@/components/language-switcher';
import { cn } from '@/lib/utils';
import { sidebarPathAllowed } from '@/lib/sidebar-modules';

function mActive(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === '/dashboard';
  if (href === '/rota') return pathname.startsWith('/rota');
  if (href === '/patrol') return pathname.startsWith('/patrol');
  if (href === '/incidents') return pathname.startsWith('/incidents');
  if (href === '/client-portal') return pathname.startsWith('/client-portal');
  return pathname === href || pathname.startsWith(`${href}/`);
}

const mobileLinks = [
  { href: '/dashboard', labelKey: 'dashboard', perm: 'guards.read' },
  { href: '/guards', labelKey: 'staff', perm: 'guards.read' },
  { href: '/sites', labelKey: 'sites', perm: 'sites.read' },
  { href: '/clients', labelKey: 'clients', perm: 'clients.read' },
  { href: '/assignments', labelKey: 'assignments', perm: 'assign.read' },
  { href: '/rota', labelKey: 'rota', perm: 'assign.read' },
  { href: '/patrol', labelKey: 'patrol', perm: 'patrol.read' },
  { href: '/incidents', labelKey: 'incidents', perm: 'incident.read' },
  { href: '/client-portal', labelKey: 'clientPortal', perm: 'staff_req.write' },
  { href: '/requests', labelKey: 'staffRequests', perm: 'staff_req.review' },
  { href: '/attendance', labelKey: 'attendance', perm: 'attend.read' },
  { href: '/documents', labelKey: 'documents', perm: 'doc.read' },
  { href: '/contractors', labelKey: 'contractors', perm: 'subs.read' },
  { href: '/payroll', labelKey: 'payroll', perm: 'payroll.read' },
  { href: '/reports', labelKey: 'reports', perm: 'rep.read' },
  { href: '/invoices', labelKey: 'invoices', perm: 'inv.read' },
  { href: '/expenses', labelKey: 'expenses', perm: 'exp.read' },
  { href: '/payments', labelKey: 'payments', perm: 'pay.read' },
  { href: '/allowances', labelKey: 'allowances', perm: 'allow.read' },
  { href: '/settings/special-days', labelKey: 'specialDays', perm: 'allow.read' },
  { href: '/settings/roles', labelKey: 'roles', perm: 'roles.read' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const tc = useTranslations('common');
  const ts = useTranslations('sidebar');
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const isSuperAdmin = user?.role === 'super_admin';
  const links = useMemo(() => {
    const showSubs = can(user, 'subs.read'); /* && user?.plan?.features?.subcontractors === true */
    return mobileLinks.filter((i) => {
      if (!sidebarPathAllowed(user?.sidebar_modules, i.href)) return false;
      if (i.href === '/contractors') return showSubs;
      if (i.href === '/expenses' && user?.enabled_modules && user.enabled_modules.expenses === false) return false;
      return can(user, i.perm);
    });
  }, [user]);

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
            <Button variant="outline" size="sm" onClick={logout}>
              {tc('logout')}
            </Button>
          </div>
        </header>
        {drawer && (
          <div className="fixed inset-0 z-50 md:hidden">
            <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close menu" onClick={() => setDrawer(false)} />
            <div className="absolute left-0 top-0 bottom-0 w-56 bg-slate-900 text-slate-100 flex flex-col shadow-xl">
              <div className="p-4 border-b border-slate-700">
                <CompanyBrand className="mb-2" />
                <div className="flex justify-end">
                  <Button type="button" variant="ghost" size="sm" className="text-slate-300" onClick={() => setDrawer(false)}>
                    ✕
                  </Button>
                </div>
              </div>
              <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
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
                        'block rounded-md px-3 py-2 text-sm',
                        pathname === href ? 'bg-slate-800' : 'hover:bg-slate-800'
                      )}
                      onClick={() => setDrawer(false)}
                    >
                      {ts(labelKey)}
                    </Link>
                  ))
                ) : (
                  links.map(({ href, labelKey }) => (
                    <Link
                      key={href}
                      href={href}
                      className={cn(
                        'block rounded-md px-3 py-2 text-sm',
                        mActive(pathname, href) ? 'bg-slate-800 font-medium' : 'hover:bg-slate-800'
                      )}
                      onClick={() => setDrawer(false)}
                    >
                      {ts(labelKey)}
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
