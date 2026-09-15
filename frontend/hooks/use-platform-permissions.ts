'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { api } from '@/lib/api';

export function usePlatformPermissions() {
  const { user } = useAuth();
  const [perms, setPerms] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(() => {
    if (!user || user.role !== 'super_admin') {
      setPerms([]);
      setLoaded(true);
      return;
    }
    api.admin
      .myPermissions()
      .then((r) => setPerms(r.permissions || []))
      .catch(() => setPerms([]))
      .finally(() => setLoaded(true));
  }, [user]);

  useEffect(() => {
    reload();
  }, [reload]);

  const can = useCallback(
    (...codes: string[]) => {
      if (!codes.length) return true;
      if (user?.role !== 'super_admin') return false;
      if (!loaded) return false;
      // Legacy / full-access fallback when permission rows not yet assigned.
      if (perms.length === 0) return true;
      return codes.some((c) => perms.includes(c));
    },
    [perms, user, loaded]
  );

  return { perms, loaded, can, reload };
}
