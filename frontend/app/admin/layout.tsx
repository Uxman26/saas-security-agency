'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { SUPER_ADMIN_LOGIN_PATH } from '@/lib/auth-routes';

/**
 * Gate the whole super admin portal in one place.
 *
 * Every page under /admin used to repeat this redirect in its own effect, which meant a
 * new page was only as protected as whoever remembered to copy it. The API enforces the
 * same rule independently via `get_current_super_admin` — this only decides what is
 * worth rendering.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const allowed = user?.role === 'super_admin';

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(SUPER_ADMIN_LOGIN_PATH);
      return;
    }
    if (!allowed) router.replace('/dashboard');
  }, [loading, user, allowed, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Render nothing until the role is known, so a tenant admin never sees admin chrome
  // flash before the redirect lands.
  if (!allowed) return null;
  return <>{children}</>;
}
