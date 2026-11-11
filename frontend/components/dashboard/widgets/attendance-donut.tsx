'use client';

import { memo, useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CalendarCheck2 } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { DashboardInsights } from '@/lib/types';
import { fmtNum, fmtPct } from '@/lib/dashboard/format';
import { useVizColors } from '@/lib/dashboard/viz';
import { cn } from '@/lib/utils';
import { WidgetCard } from '../kit/widget-card';
import { EmptyState } from '../kit/empty-state';
import { DeltaBadge } from '../kit/delta-badge';

const KEYS = ['on_time', 'late', 'absent', 'cancelled', 'unrecorded'] as const;
const SWATCH: Record<(typeof KEYS)[number], string> = {
  on_time: 'bg-viz-ontime',
  late: 'bg-viz-late',
  absent: 'bg-viz-absent',
  cancelled: 'bg-viz-neutral',
  unrecorded: 'bg-viz-faint ring-1 ring-inset ring-viz-neutral/40',
};

function AttendanceDonutInner({ data }: { data: DashboardInsights['attendance'] }) {
  const t = useTranslations('dashboard.attendance');
  const c = useVizColors();
  const fills = {
    on_time: c['viz-ontime'],
    late: c['viz-late'],
    absent: c['viz-absent'],
    cancelled: c['viz-neutral'],
    unrecorded: c['viz-faint'],
  };
  const rows = useMemo(() => KEYS.map((k) => ({ k, v: data[k] })), [data]);
  const total = rows.reduce((a, r) => a + r.v, 0);
  const slices = rows.filter((r) => r.v > 0);

  return (
    <WidgetCard title={t('title')} subtitle={t('subtitle')}>
      {!total ? (
        <EmptyState icon={CalendarCheck2} title={t('empty')} hint={t('emptyHint')} action={{ label: t('open'), href: '/attendance' }} />
      ) : (
        <div className="flex h-full flex-col">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">{t('onTimeRate')}</p>
              <p className="mt-0.5 flex items-center gap-2 text-[1.75rem] font-semibold leading-none tracking-tight tabular-nums">
                {data.on_time_rate == null ? '—' : fmtPct(data.on_time_rate)}
                {data.on_time_rate != null ? (
                  <DeltaBadge value={data.on_time_rate} previous={data.previous_on_time_rate} unit="pts" label={t('vsPrevious')} />
                ) : null}
              </p>
            </div>
          </div>
          <figure className="relative mx-auto my-3 aspect-square w-full max-w-[200px]" role="img" aria-label={t('aria', { total, rate: data.on_time_rate ?? 0 })}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="v"
                  nameKey="k"
                  innerRadius="72%"
                  outerRadius="100%"
                  paddingAngle={slices.length > 1 ? 2 : 0}
                  cornerRadius={4}
                  stroke={c.surface}
                  strokeWidth={2}
                  startAngle={90}
                  endAngle={-270}
                  animationDuration={900}
                >
                  {slices.map((s) => (
                    <Cell key={s.k} fill={fills[s.k]} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    const p = payload?.[0]?.payload as { k: (typeof KEYS)[number]; v: number } | undefined;
                    if (!active || !p) return null;
                    return (
                      <div className="rounded-lg bg-popover px-3 py-2 text-xs shadow-pop ring-1 ring-hairline">
                        <span className="font-semibold">{t(`status.${p.k}`)}</span>
                        <span className="ms-3 tabular-nums">
                          {fmtNum(p.v)} · {fmtPct((p.v / total) * 100)}
                        </span>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <figcaption className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-semibold tabular-nums tracking-tight">{fmtNum(total)}</span>
              <span className="text-[11px] text-muted-foreground">{t('records')}</span>
            </figcaption>
          </figure>
          <ul className="mt-auto space-y-1.5">
            {rows.map((r) => (
              <li key={r.k}>
                <Link
                  href="/attendance"
                  className={cn(
                    'flex items-center gap-2.5 rounded-md px-1.5 py-1 text-[13px] transition-colors hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    !r.v && 'opacity-55'
                  )}
                >
                  <span className={cn('size-2.5 shrink-0 rounded-[3px]', SWATCH[r.k])} aria-hidden />
                  <span className="flex-1 text-muted-foreground">{t(`status.${r.k}`)}</span>
                  <span className="font-medium tabular-nums">{fmtNum(r.v)}</span>
                  <span className="w-12 text-end text-xs tabular-nums text-muted-foreground">{fmtPct((r.v / total) * 100)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </WidgetCard>
  );
}

export const AttendanceDonut = memo(AttendanceDonutInner);
export default AttendanceDonut;
