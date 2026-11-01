'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { api } from '@/lib/api';

// One shared copy for the sidebar, the mobile drawer and the page, so they never
// disagree and page navigation does not refetch (and re-filter) the nav.
type Cache = { userId: number; perms: string[] };
let cache: Cache | null = null;
let inflight: { userId: number; promise: Promise<string[]> } | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

async function fetchPerms(userId: number): Promise<string[]> {
  if (inflight?.userId === userId) return inflight.promise;
  const promise = (async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await api.admin.myPermissions();
        return r.permissions || [];
      } catch (e) {
        lastErr = e;
        await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
      }
    }
    throw lastErr;
  })();
  inflight = { userId, promise };
  try {
    const perms = await promise;
    cache = { userId, perms };
    notify();
    return perms;
  } finally {
    if (inflight?.promise === promise) inflight = null;
  }
}

/** Drop the cached permissions, e.g. after the current admin's role changed. */
export function invalidatePlatformPermissions() {
  cache = null;
  notify();
}

export function usePlatformPermissions() {
  const { user } = useAuth();
  const userId = user?.role === 'super_admin' ? user.id : null;
  const [, setTick] = useState(0);

  useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  const current = userId != null && cache?.userId === userId ? cache : null;

  useEffect(() => {
    if (userId == null || current) return;
    fetchPerms(userId).catch(() => {
      // Keep gated items hidden rather than guessing; the next mount retries.
    });
  }, [userId, current]);

  const perms = current?.perms ?? [];
  const loaded = userId == null || current != null;

  const reload = useCallback(() => {
    if (userId == null) return;
    cache = null;
    fetchPerms(userId).catch(() => notify());
  }, [userId]);

  const can = useCallback(
    (...codes: string[]) => {
      if (!codes.length) return true;
      if (userId == null || !current) return false;
      return codes.some((c) => current.perms.includes(c));
    },
    [userId, current]
  );

  return { perms, loaded, can, reload };
}
