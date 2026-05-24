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
import { cn } from '@/lib/utils';
import { sidebarPathAllowed } from '@/lib/sidebar-modules';

function mActive(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === '/dashboard';
  if (href === '/rota') return pathname.startsWith('/rota');
  return pathname === href || pathname.startsWith(`${href}/`);
}

const mobileLinks = [
  { href: '/dashboard', label: 'Dashboard', perm: 'guards.read' },
  { href: '/guards', label: 'Staff', perm: 'guards.read' },
  { href: '/sites', label: 'Sites', perm: 'sites.read' },
  { href: '/clients', label: 'Clients', perm: 'clients.read' },
  { href: '/assignments', label: 'Assignments', perm: 'assign.read' },
  { href: '/rota', label: 'Rotas & Shifts', perm: 'assign.read' },
  { href: '/attendance', label: 'Attendance', perm: 'attend.read' },
  { href: '/documents', label: 'Documents', perm: 'doc.read' },
  { href: '/contractors', label: 'Contractors', perm: 'subs.read' },
  { href: '/payroll', label: 'Payroll', perm: 'payroll.read' },
  { href: '/invoices', label: 'Invoices', perm: 'inv.read' },
  { href: '/payments', label: 'Payments', perm: 'pay.read' },
  { href: '/allowances', label: 'Allowances', perm: 'allow.read' },
  { href: '/settings/special-days', label: 'Special days', perm: 'allow.read' },
  { href: '/settings/roles', label: 'Roles', perm: 'roles.read' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const isSuperAdmin = user?.role === 'super_admin';
  const links = useMemo(() => {
    const showSubs = can(user, 'subs.read'); /* && user?.plan?.features?.subcontractors === true */
    return mobileLinks.filter((i) => {
      if (!sidebarPathAllowed(user?.sidebar_modules, i.href)) return false;
      if (i.href === '/contractors') return showSubs;
      return can(user, i.perm);
    });
  }, [user]);

  return (
    <div className="min-h-screen flex bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-40 h-12 shrink-0 border-b bg-card/95 backdrop-blur flex items-center justify-between px-3 gap-2">
          <div className="flex items-center gap-2 min-w-0 md:hidden">
            <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => setDrawer(true)}>
              <Menu className="size-5" />
            </Button>
            <CompanyBrand className="text-primary text-sm [&_span]:text-primary" />
          </div>
          <div className="hidden md:block flex-1" />
          <div className="flex items-center gap-1.5 shrink-0">
            <ThemeToggle />
            <AlertsPanel />
            <EmailDialog />
            <Button variant="outline" size="sm" onClick={logout}>
              Logout
            </Button>
          </div>
        </header>
        {drawer && (
          <div className="fixed inset-0 z-50 md:hidden">
            <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close menu" onClick={() => setDrawer(false)} />
            <div className="absolute left-0 top-0 bottom-0 w-64 bg-slate-900 text-slate-100 flex flex-col shadow-xl">
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
                  ['/admin/companies', '/admin/receipts', '/admin/admins'].map((href) => (
                    <Link
                      key={href}
                      href={href}
                      className={cn(
                        'block rounded-md px-3 py-2 text-sm',
                        pathname === href ? 'bg-slate-800' : 'hover:bg-slate-800'
                      )}
                      onClick={() => setDrawer(false)}
                    >
                      {href === '/admin/companies' ? 'Companies' : href === '/admin/receipts' ? 'Receipts' : 'Admins'}
                    </Link>
                  ))
                ) : (
                  links.map(({ href, label }) => (
                    <Link
                      key={href}
                      href={href}
                      className={cn(
                        'block rounded-md px-3 py-2 text-sm',
                        mActive(pathname, href) ? 'bg-slate-800 font-medium' : 'hover:bg-slate-800'
                      )}
                      onClick={() => setDrawer(false)}
                    >
                      {label}
                    </Link>
                  ))
                )}
              </nav>
            </div>
          </div>
        )}
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
