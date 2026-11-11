'use client';

import { memo, useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { MapPinned } from 'lucide-react';
import type { DashboardInsights, TodayShiftStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { WidgetCard } from '../kit/widget-card';
import { EmptyState } from '../kit/empty-state';
import { STATUS_BAR } from './status-chip';

const ORDER: TodayShiftStatus[] = ['on_duty', 'completed', 'late', 'scheduled', 'absent', 'cancelled'];
const MAX = 7;

function SitesTodayInner({ shifts }: { shifts: DashboardInsights['today_shifts'] }) {
  const t = useTranslations('dashboard.sites');
  const ts = useTranslations('dashboard.shiftStatus');
  const sites = useMemo(() => {
    const m = new Map<number, { id: number; name: string; total: number; by: Partial<Record<TodayShiftStatus, number>> }>();
    for (const s of shifts) {
      const row = m.get(s.site_id) ?? { id: s.site_id, name: s.site_name || '—', total: 0, by: {} };
      row.total += 1;
      row.by[s.status] = (row.by[s.status] ?? 0) + 1;
      m.set(s.site_id, row);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [shifts]);
  const max = sites[0]?.total ?? 1;
  const used = ORDER.filter((k) => shifts.some((s) => s.status === k));

  return (
    <WidgetCard title={t('title')} subtitle={t('subtitle', { count: sites.length })}>
      {!sites.length ? (
        <EmptyState icon={MapPinned} title={t('empty')} hint={t('emptyHint')} action={{ label: t('plan'), href: '/rota' }} />
      ) : (
        <div className="flex h-full flex-col">
          <ul className="space-y-3">
            {sites.slice(0, MAX).map((s) => {
              const covered = (s.by.on_duty ?? 0) + (s.by.completed ?? 0) + (s.by.late ?? 0);
              return (
                <li key={s.id}>
                  <Link
                    href="/sites"
                    className="group/s block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={t('rowAria', { site: s.name, covered, total: s.total })}
                  >
                    <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px]">
                      <span className="truncate font-medium group-hover/s:text-primary">{s.name}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        <span className="font-semibold text-foreground">{covered}</span>/{s.total}
                      </span>
                    </div>
                    <div className="flex h-2 overflow-hidden rounded-full bg-foreground/[0.04]" style={{ width: `${Math.max(18, (s.total / max) * 100)}%` }}>
                      {ORDER.map((k) =>
                        s.by[k] ? (
                          <span
                            key={k}
                            className={cn('h-full border-e-2 border-surface last:border-e-0', STATUS_BAR[k])}
                            style={{ flexGrow: s.by[k] }}
                          />
                        ) : null
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          {sites.length > MAX ? (
            <Link href="/sites" className="mt-3 text-xs font-medium text-primary hover:underline">
              {t('more', { count: sites.length - MAX })}
            </Link>
          ) : null}
          <ul className="mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-4 text-[11px] text-muted-foreground">
            {used.map((k) => (
              <li key={k} className="inline-flex items-center gap-1.5">
                <span className={cn('size-2 rounded-[2px]', STATUS_BAR[k], k === 'scheduled' && 'ring-1 ring-inset ring-viz-neutral/50')} aria-hidden />
                {ts(k)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </WidgetCard>
  );
}

export const SitesToday = memo(SitesTodayInner);
export default SitesToday;
