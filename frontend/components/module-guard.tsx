'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { canModule, isAdminBypass } from '@/lib/permissions';

type ModuleAction = 'view' | 'create' | 'edit' | 'delete';

const PATH_GUARD_EXEMPT_PREFIXES = [
  '/admin',
  '/patrol/check',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/payment-pending',
];

function pathGuardExempt(pathname: string): boolean {
  if (pathname === '/dashboard') return true;
  return PATH_GUARD_EXEMPT_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export function ModuleGuard({
  moduleKey,
  action = 'view',
  children,
}: {
  moduleKey: string;
  action?: ModuleAction;
  children: React.ReactNode;
}) {
  const { user, loading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && isAuthenticated && user && !canModule(user, moduleKey, action)) {
      router.replace('/dashboard');
    }
  }, [loading, isAuthenticated, user, moduleKey, action, router]);

  if (loading || !user) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!canModule(user, moduleKey, action)) {
    return null;
  }

  return <>{children}</>;
}

export function useModulePathGuard(pathname: string) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user) return;
    if (user.role === 'super_admin' || isAdminBypass(user)) return;
    if (pathGuardExempt(pathname)) return;

    const modules = user.module_access || [];
    const match = [...modules]
      .sort((a, b) => b.sidebar_path.length - a.sidebar_path.length)
      .find((m) => pathname === m.sidebar_path || pathname.startsWith(`${m.sidebar_path}/`));

    if (match && !match.can_view) {
      router.replace('/dashboard');
    }
  }, [loading, user, pathname, router]);
}
