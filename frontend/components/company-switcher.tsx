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
      <p className="truncate text-xs font-medium text-sidebar-foreground">{user.company_name}</p>
      {loginId ? (
        <p className="truncate font-mono text-[11px] tracking-wide text-sidebar-foreground/70">
          Company ID {loginId}
        </p>
      ) : null}
    </div>
  );
}
