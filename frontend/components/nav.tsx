'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { EmailDialog } from '@/components/email-dialog';
import { ThemeToggle } from '@/components/theme-toggle';
import { Shield, Building2, Menu, X } from 'lucide-react';
import { useState } from 'react';

const companyNav = [
  { href: '/guards', label: 'Guards' },
  { href: '/sites', label: 'Sites' },
  { href: '/clients', label: 'Clients' },
  { href: '/assignments', label: 'Assignments' },
  { href: '/rota', label: 'Rota' },
  { href: '/attendance', label: 'Attendance' },
  { href: '/documents', label: 'Documents' },
  { href: '/sub-contractors', label: 'Sub-Contractors' },
  { href: '/payroll', label: 'Payroll' },
  { href: '/invoices', label: 'Invoices' },
  { href: '/payments', label: 'Payments' },
  { href: '/allowances', label: 'Allowances' },
];

export function Nav() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const isSuperAdmin = user?.role === 'super_admin';
  const [mobileOpen, setMobileOpen] = useState(false);

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
              companyNav.map(({ href, label }) => (
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
              companyNav.map(({ href, label }) => (
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
