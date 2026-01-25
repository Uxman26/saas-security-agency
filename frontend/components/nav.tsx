'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { EmailDialog } from '@/components/email-dialog';

export function Nav() {
  const { logout } = useAuth();

  return (
    <nav className="border-b">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex gap-4">
          <Link href="/dashboard" className="font-semibold">
            Security Agency
          </Link>
          <Link href="/guards" className="text-muted-foreground hover:text-foreground">
            Guards
          </Link>
          <Link href="/sites" className="text-muted-foreground hover:text-foreground">
            Sites
          </Link>
          <Link href="/assignments" className="text-muted-foreground hover:text-foreground">
            Assignments
          </Link>
          <Link href="/rota" className="text-muted-foreground hover:text-foreground">
            Rota
          </Link>
          <Link href="/clients" className="text-muted-foreground hover:text-foreground">
            Clients
          </Link>
          <Link href="/sub-contractors" className="text-muted-foreground hover:text-foreground">
            Sub-Contractors
          </Link>
        </div>
        <div className="flex gap-2">
          <EmailDialog />
          <Button variant="outline" onClick={logout}>
            Logout
          </Button>
        </div>
      </div>
    </nav>
  );
}
