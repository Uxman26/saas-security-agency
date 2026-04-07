'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { EmailDialog } from '@/components/email-dialog';
import { ThemeToggle } from '@/components/theme-toggle';
import { Shield, Building2, Menu, X } from 'lucide-react';

const companyNav = [
  { href: '/guards', label: 'Guards', perm: 'guards.read' },
  { href: '/sites', label: 'Sites', perm: 'sites.read' },
  { href: '/clients', label: 'Clients', perm: 'clients.read' },
  { href: '/assignments', label: 'Assignments', perm: 'assign.read' },
  { href: '/rota', label: 'Rota', perm: 'assign.read' },
  { href: '/attendance', label: 'Attendance', perm: 'attend.read' },
  { href: '/documents', label: 'Documents', perm: 'doc.read' },
  { href: '/contractors', label: 'Contractors', perm: 'subs.read' },
  { href: '/payroll', label: 'Payroll', perm: 'payroll.read' },
  { href: '/invoices', label: 'Invoices', perm: 'inv.read' },
  { href: '/payments', label: 'Payments', perm: 'pay.read' },
  { href: '/allowances', label: 'Allowances', perm: 'allow.read' },
  { href: '/settings/roles', label: 'Roles', perm: 'roles.read' },
];

export function Nav() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const isSuperAdmin = user?.role === 'super_admin';
  const [mobileOpen, setMobileOpen] = useState(false);
  const linksNav = useMemo(() => {
    const showSubs = can(user, 'subs.read') && user?.plan?.features?.subcontractors === true;
    return companyNav.filter((i) => {
      if (i.href === '/contractors') return showSubs;
      return can(user, i.perm);
    });
  }, [user]);

  const isActive = (href: string) => pathname === href;

  return (
    <nav className="sticky top-0 z-50 border-b bg-card/90 backdrop-blur-md">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-semibold text-primary transition-colors hover:text-primary/90 shrink-0"
          >
            <Shield className="size-5" />
            <span className="hidden sm:inline">SecureForce Manager</span>
            <span className="sm:hidden">SFM</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden lg:flex items-center gap-0.5 flex-wrap">
            {isSuperAdmin ? (
              <Link
                href="/admin/companies"
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  isActive('/admin/companies')
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                } flex items-center gap-1.5`}
              >
                <Building2 className="size-4" />
                Companies
              </Link>
            ) : (
              linksNav.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    isActive(href)
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                >
                  {label}
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <EmailDialog />
          <Button variant="outline" size="sm" onClick={logout} className="hidden sm:flex">
            Logout
          </Button>
          {/* Mobile menu toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden border-t bg-card px-4 py-3">
          <div className="flex flex-col gap-1">
            {isSuperAdmin ? (
              <Link
                href="/admin/companies"
                className="px-3 py-2 text-sm rounded-md hover:bg-accent"
                onClick={() => setMobileOpen(false)}
              >
                Companies
              </Link>
            ) : (
              linksNav.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={`px-3 py-2 text-sm rounded-md transition-colors ${
                    isActive(href)
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                  onClick={() => setMobileOpen(false)}
                >
                  {label}
                </Link>
              ))
            )}
            <hr className="my-2" />
            <Button variant="outline" size="sm" onClick={() => { logout(); setMobileOpen(false); }}>
              Logout
            </Button>
          </div>
        </div>
      )}
    </nav>
  );
}
