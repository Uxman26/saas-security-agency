'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { storageGet, storageSet } from '@/lib/safe-storage';

export const WIDGETS = [
  { id: 'live', span: 'lg:col-span-12' },
  { id: 'kpis', span: 'lg:col-span-12' },
  { id: 'shifts', span: 'lg:col-span-8' },
  { id: 'attendance', span: 'lg:col-span-4' },
  { id: 'finance', span: 'lg:col-span-8' },
  { id: 'sites', span: 'lg:col-span-4' },
  { id: 'actions', span: 'lg:col-span-7' },
  { id: 'activity', span: 'lg:col-span-5' },
  { id: 'today', span: 'lg:col-span-8' },
  { id: 'partners', span: 'lg:col-span-4' },
] as const;

export type WidgetId = (typeof WIDGETS)[number]['id'];
export type Layout = { order: WidgetId[]; hidden: WidgetId[] };

const DEFAULT: Layout = { order: WIDGETS.map((w) => w.id), hidden: [] };
const ids = new Set<string>(DEFAULT.order);

const sanitize = (raw: unknown): Layout => {
  const r = raw as Partial<Layout> | null;
  if (!r || !Array.isArray(r.order)) return DEFAULT;
  const order = r.order.filter((x): x is WidgetId => ids.has(x));
  DEFAULT.order.forEach((id) => !order.includes(id) && order.push(id));
  const hidden = (Array.isArray(r.hidden) ? r.hidden : []).filter((x): x is WidgetId => ids.has(x));
  return { order, hidden };
};

const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  window.addEventListener('storage', cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', cb);
  };
};

export function useDashboardLayout(userId: number | undefined) {
  const key = `controlops-dashboard-layout-v1-${userId ?? 'anon'}`;
  const raw = useSyncExternalStore(subscribe, () => storageGet(key), () => null);
  const layout = useMemo(() => {
    try {
      return raw ? sanitize(JSON.parse(raw)) : DEFAULT;
    } catch {
      return DEFAULT;
    }
  }, [raw]);

  const save = useCallback(
    (next: Layout) => {
      storageSet(key, JSON.stringify(next));
      listeners.forEach((l) => l());
    },
    [key]
  );

  const reset = useCallback(() => save(DEFAULT), [save]);
  return { layout, save, reset };
}
