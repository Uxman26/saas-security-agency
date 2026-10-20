'use client';

import { useAuth } from '@/contexts/auth-context';
import { cn } from '@/lib/utils';

/** Current tenant label only. Tenant context is chosen at login, not from the profile. */
export function CompanySwitcher({ className = '' }: { className?: string }) {
  const { user } = useAuth();
  if (!user || user.role === 'super_admin') return null;
  const loginId = user.company_login_id;
  if (!loginId && !user.company_name) return null;

  return (
    <div className={cn('min-w-0 px-0.5', className)}>
      {loginId ? (
        <p className="break-all font-mono text-[11px] leading-tight tracking-wide text-sidebar-foreground/70">
          Company ID {loginId}
        </p>
      ) : user.company_name ? (
        <p className="line-clamp-2 break-words text-xs font-medium leading-tight text-sidebar-foreground">
          {user.company_name}
        </p>
      ) : null}
    </div>
  );
}
