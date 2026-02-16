'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { EmailDialog } from '@/components/email-dialog';
import { ThemeToggle } from '@/components/theme-toggle';
import { Shield } from 'lucide-react';

export function Nav() {
  const { logout } = useAuth();

  return (
    <nav className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-md">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-semibold text-primary transition-colors hover:text-primary/90"
          >
            <Shield className="size-5" />
            SecureForce Manager
          </Link>
          <div className="hidden md:flex items-center gap-1">
            {[
              { href: '/guards', label: 'Guards' },
              { href: '/sites', label: 'Sites' },
              { href: '/assignments', label: 'Assignments' },
              { href: '/rota', label: 'Rota' },
              { href: '/clients', label: 'Clients' },
              { href: '/sub-contractors', label: 'Sub-Contractors' },
              { href: '/payroll', label: 'Payroll' },
              { href: '/invoices', label: 'Invoices' },
              { href: '/allowances', label: 'Allowances' },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="px-3 py-2 text-sm text-muted-foreground rounded-md transition-colors hover:text-foreground hover:bg-accent"
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <EmailDialog />
          <Button variant="outline" size="sm" onClick={logout}>
            Logout
          </Button>
        </div>
      </div>
    </nav>
  );
}
