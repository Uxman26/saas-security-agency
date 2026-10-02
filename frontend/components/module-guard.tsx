'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/auth-context';
import { canModule, isAdminBypass } from '@/lib/permissions';
import { isCapabilityModule } from '@/lib/nav-modules';

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
  '/settings',
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
  const tc = useTranslations('common');

  useEffect(() => {
    if (!loading && isAuthenticated && user && !canModule(user, moduleKey, action)) {
      router.replace('/dashboard');
    }
  }, [loading, isAuthenticated, user, moduleKey, action, router]);

  if (loading || !user) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-muted-foreground">
        {tc('loading')}
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

    const modules = (user.module_access || []).filter((m) => !isCapabilityModule(m));
    const match = [...modules]
      .sort((a, b) => b.sidebar_path.length - a.sidebar_path.length)
      .find((m) => pathname === m.sidebar_path || pathname.startsWith(`${m.sidebar_path}/`));

    if (!match) return;
    if (!match.can_view) {
      router.replace('/dashboard');
      return;
    }
    const mods = user.enabled_modules;
    if (mods) {
      if (match.key === 'expenses' && mods.expenses === false) {
        router.replace('/dashboard');
        return;
      }
      if (match.key === 'leads' && mods.leads === false) {
        router.replace('/dashboard');
        return;
      }
      if (match.key === 'sms' && mods.whatsapp === false) {
        router.replace('/dashboard');
        return;
      }
      if (match.key === 'email_settings' && mods.email === false) {
        router.replace('/dashboard');
        return;
      }
      if (match.key === 'client_portal' && mods.client_portal === false) {
        router.replace('/dashboard');
        return;
      }
    }
    const feats = user.plan?.features;
    if (feats) {
      if (match.key === 'contractors' && feats.contractors === false) {
        router.replace('/dashboard');
        return;
      }
      if (match.key === 'sub_contractors' && feats.sub_contractors === false && feats.subcontractors === false) {
        router.replace('/dashboard');
      }
    }
  }, [loading, user, pathname, router]);
}
