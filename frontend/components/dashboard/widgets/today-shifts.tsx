'use client';

import { memo, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CalendarClock } from 'lucide-react';
import type { DashboardInsights, TodayShiftStatus } from '@/lib/types';
import { WidgetCard } from '../kit/widget-card';
import { EmptyState } from '../kit/empty-state';
import { Segmented } from '../kit/segmented';
import { StatusChip } from './status-chip';
import { Avatar } from './avatar';

type Filter = 'all' | 'attention' | 'active';
const ATTENTION: TodayShiftStatus[] = ['late', 'absent'];
const ACTIVE: TodayShiftStatus[] = ['on_duty', 'late'];

function TodayShiftsInner({ shifts }: { shifts: DashboardInsights['today_shifts'] }) {
  const t = useTranslations('dashboard.today');
  const [filter, setFilter] = useState<Filter>('all');
  const counts = useMemo(
    () => ({
      attention: shifts.filter((s) => ATTENTION.includes(s.status)).length,
      active: shifts.filter((s) => ACTIVE.includes(s.status)).length,
    }),
    [shifts]
  );
  const rows = useMemo(
    () =>
      filter === 'all' ? shifts : shifts.filter((s) => (filter === 'attention' ? ATTENTION : ACTIVE).includes(s.status)),
    [shifts, filter]
  );

  return (
    <WidgetCard
      title={t('title')}
      subtitle={t('subtitle', { count: shifts.length })}
      actions={
        shifts.length ? (
          <Segmented
            label={t('filterLabel')}
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: t('filter.all') },
              { value: 'active', label: t('filter.active'), badge: counts.active },
              { value: 'attention', label: t('filter.attention'), badge: counts.attention },
            ]}
          />
        ) : null
      }
      bodyClassName="flex flex-col"
    >
      {!shifts.length ? (
        <EmptyState icon={CalendarClock} title={t('empty')} hint={t('emptyHint')} action={{ label: t('plan'), href: '/rota' }} />
      ) : !rows.length ? (
        <EmptyState icon={CalendarClock} tone="success" title={t('noneFiltered')} />
      ) : (
        <div className="-mx-2 max-h-[22rem] overflow-auto">
          <table className="w-full min-w-[30rem] border-separate border-spacing-0 text-[13px]">
            <caption className="sr-only">{t('title')}</caption>
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="text-start text-xs text-muted-foreground">
                <th scope="col" className="border-b border-hairline px-2 py-2 text-start font-medium">{t('col.staff')}</th>
                <th scope="col" className="border-b border-hairline px-2 py-2 text-start font-medium">{t('col.site')}</th>
                <th scope="col" className="border-b border-hairline px-2 py-2 text-start font-medium">{t('col.time')}</th>
                <th scope="col" className="border-b border-hairline px-2 py-2 text-end font-medium">{t('col.status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="group/r transition-colors hover:bg-foreground/[0.025]">
                  <td className="border-b border-hairline px-2 py-2.5">
                    <Link href={`/guards/${s.guard_id}`} className="flex items-center gap-2.5 rounded font-medium hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <Avatar name={s.guard_name} />
                      <span className="truncate">{s.guard_name}</span>
                    </Link>
                  </td>
                  <td className="border-b border-hairline px-2 py-2.5 text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="size-2 shrink-0 rounded-full bg-viz-neutral"
                        style={s.site_color ? { backgroundColor: s.site_color } : undefined}
                        aria-hidden
                      />
                      <span className="truncate">{s.site_name || '—'}</span>
                    </span>
                  </td>
                  <td className="border-b border-hairline px-2 py-2.5 tabular-nums text-muted-foreground">
                    {s.start && s.end ? `${s.start.slice(0, 5)}–${s.end.slice(0, 5)}` : '—'}
                  </td>
                  <td className="border-b border-hairline px-2 py-2.5 text-end">
                    <StatusChip status={s.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {shifts.length ? (
        <Link href="/rota" className="mt-3 self-start rounded text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {t('open')}
        </Link>
      ) : null}
    </WidgetCard>
  );
}

export const TodayShifts = memo(TodayShiftsInner);
export default TodayShifts;
