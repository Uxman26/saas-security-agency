'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { TOKEN_KEY } from '@/lib/session-sync';
import { useAuth } from '@/contexts/auth-context';
import { toast } from '@/lib/toast';

const ADMIN_TOKEN_BACKUP = 'admin_token_backup';

export function ImpersonationBanner() {
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setActive(Boolean(localStorage.getItem(ADMIN_TOKEN_BACKUP)) && user?.role !== 'super_admin');
  }, [user]);

  if (!active) return null;

  const end = async () => {
    try {
      await api.admin.endImpersonate();
    } catch {
      /* session may already be revoked */
    }
    const backup = localStorage.getItem(ADMIN_TOKEN_BACKUP);
    if (backup) {
      localStorage.setItem(TOKEN_KEY, backup);
      localStorage.removeItem(ADMIN_TOKEN_BACKUP);
    }
    try {
      await refreshUser();
    } catch {
      /* ignore */
    }
    toast.success('Impersonation ended');
    router.push('/admin/companies');
  };

  return (
    <div className="flex items-center justify-between gap-3 bg-amber-600 px-4 py-2 text-sm text-white">
      <span>
        Support access as <strong>{user?.full_name || user?.email}</strong>
      </span>
      <Button type="button" size="sm" variant="secondary" onClick={() => void end()}>
        End session
      </Button>
    </div>
  );
}
