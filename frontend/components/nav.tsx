'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function Nav() {
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/login');
  };

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
        </div>
        <Button variant="outline" onClick={handleLogout}>
          Logout
        </Button>
      </div>
    </nav>
  );
}
