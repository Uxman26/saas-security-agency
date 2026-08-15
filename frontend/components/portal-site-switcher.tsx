'use client';

import { useCallback, useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Site } from '@/lib/types';
import { MapPin } from 'lucide-react';

const STORAGE_KEY = 'controlops-portal-site';
const ALL = 'all';

/** Remembers which of the caller's sites the portal is scoped to.
 *
 * The value is only ever a filter — the API independently rejects a site the login
 * cannot see — so a stale or hand-edited localStorage entry cannot widen access. It is
 * still reconciled against the live site list on load so a removed site does not leave
 * the portal stuck showing nothing.
 */
export function usePortalSiteScope(sites: Site[]) {
  const [siteId, setSiteId] = useState<number | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    if (restored || sites.length === 0) return;
    setRestored(true);
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && sites.some((s) => s.id === parsed)) {
        setSiteId(parsed);
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Private-browsing or blocked storage: fall back to "all sites".
    }
  }, [sites, restored]);

  const select = useCallback((next: number | null) => {
    setSiteId(next);
    try {
      if (next == null) window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Non-fatal: the scope just will not persist across reloads.
    }
  }, []);

  return { siteId, select };
}

export function PortalSiteSwitcher({
  sites,
  siteId,
  onChange,
}: {
  sites: Site[];
  siteId: number | null;
  onChange: (next: number | null) => void;
}) {
  // A login with a single site has nothing to switch between.
  if (sites.length < 2) return null;

  return (
    <div className="flex items-center gap-2">
      <MapPin className="size-4 text-muted-foreground shrink-0" />
      <Select
        value={siteId == null ? ALL : String(siteId)}
        onValueChange={(v) => onChange(v === ALL ? null : Number(v))}
      >
        <SelectTrigger className="w-[220px]">
          <SelectValue placeholder="All sites" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All sites</SelectItem>
          {sites.map((s) => (
            <SelectItem key={s.id} value={String(s.id)}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
