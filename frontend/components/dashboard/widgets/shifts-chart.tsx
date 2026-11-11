'use client';

import { memo, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Area, AreaChart, CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DashboardInsights } from '@/lib/types';
import { fmtDate, fmtDayShort, fmtNum, fmtPct } from '@/lib/dashboard/format';
import { useVizColors } from '@/lib/dashboard/viz';
import { WidgetCard } from '../kit/widget-card';
import { Segmented } from '../kit/segmented';

type Metric = 'shifts' | 'hours' | 'coverage';
type Row = DashboardInsights['shifts'][number];

function ShiftsChartInner({ data, today }: { data: Row[]; today: string }) {
  const t = useTranslations('dashboard.shifts');
  const locale = useLocale();
  const c = useVizColors();
  const gid = useId().replace(/:/g, '');
  const [metric, setMetric] = useState<Metric>('shifts');

  const past = useMemo(() => data.filter((d) => d.date <= today), [data, today]);
  const ahead = useMemo(() => data.filter((d) => d.date > today), [data, today]);
  const totals = useMemo(() => {
    const cov = past.filter((d) => d.coverage != null);
    return {
      shifts: past.reduce((a, d) => a + d.shifts, 0),
      hours: past.reduce((a, d) => a + d.hours, 0),
      coverage: cov.length ? cov.reduce((a, d) => a + (d.coverage ?? 0), 0) / cov.length : null,
      ahead: ahead.reduce((a, d) => a + d.shifts, 0),
    };
  }, [past, ahead]);

  const color = metric === 'coverage' ? c['viz-2'] : c['viz-1'];
  const firstAhead = ahead[0]?.date;
  const last = data[data.length - 1]?.date;
  const tickEvery = Math.max(0, Math.ceil(data.length / 8) - 1);

  return (
    <WidgetCard
      title={t('title')}
      subtitle={ahead.length ? t('subtitleAhead', { days: ahead.length }) : t('subtitle')}
      actions={
        <Segmented
          label={t('metricLabel')}
          value={metric}
          onChange={setMetric}
          options={[
            { value: 'shifts', label: t('metric.shifts') },
            { value: 'hours', label: t('metric.hours') },
            { value: 'coverage', label: t('metric.coverage') },
          ]}
        />
      }
      bodyClassName="flex flex-col"
    >
      <dl className="mb-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:flex sm:flex-wrap">
        {[
          { k: 'worked', v: fmtNum(totals.shifts) },
          { k: 'hoursWorked', v: fmtNum(Math.round(totals.hours)) },
          { k: 'avgCoverage', v: totals.coverage == null ? '—' : fmtPct(totals.coverage) },
          { k: 'scheduledAhead', v: fmtNum(totals.ahead) },
        ].map((s) => (
          <div key={s.k}>
            <dt className="text-xs text-muted-foreground">{t(`stat.${s.k}`)}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight">{s.v}</dd>
          </div>
        ))}
      </dl>
      <figure className="min-h-[240px] flex-1 sm:min-h-[272px]" aria-label={t('aria', { metric: t(`metric.${metric}`) })} role="img">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`f-${gid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={c.hairline} vertical={false} />
            {firstAhead && last ? (
              <ReferenceArea x1={firstAhead} x2={last} fill={c['viz-faint']} fillOpacity={0.45} ifOverflow="extendDomain" />
            ) : null}
            <XAxis
              dataKey="date"
              tickFormatter={(v) => fmtDayShort(v, locale)}
              tick={{ fontSize: 11, fill: c['muted-foreground'] }}
              axisLine={false}
              tickLine={false}
              interval={tickEvery}
              minTickGap={12}
              reversed={locale === 'ar'}
            />
            <YAxis
              orientation={locale === 'ar' ? 'right' : 'left'}
              allowDecimals={false}
              domain={metric === 'coverage' ? [0, 100] : [0, 'auto']}
              tickFormatter={(v) => (metric === 'coverage' ? `${v}%` : fmtNum(v))}
              tick={{ fontSize: 11, fill: c['muted-foreground'] }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <ReferenceLine
              x={today}
              stroke={c.foreground}
              strokeOpacity={0.35}
              strokeDasharray="3 3"
              label={{ value: t('today'), position: 'insideTopRight', fill: c['muted-foreground'], fontSize: 11 }}
            />
            <Tooltip
              cursor={{ stroke: c['muted-foreground'], strokeOpacity: 0.3 }}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as Row | undefined;
                if (!active || !row) return null;
                return (
                  <div className="rounded-lg bg-popover px-3 py-2 text-xs shadow-pop ring-1 ring-hairline">
                    <p className="font-semibold text-foreground">
                      {fmtDate(row.date)}
                      {row.date > today ? <span className="ms-1.5 font-normal text-muted-foreground">· {t('scheduled')}</span> : null}
                    </p>
                    <dl className="mt-1.5 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 tabular-nums">
                      <dt className="text-muted-foreground">{t('metric.shifts')}</dt>
                      <dd className="text-end font-medium">{fmtNum(row.shifts)}</dd>
                      <dt className="text-muted-foreground">{t('metric.hours')}</dt>
                      <dd className="text-end font-medium">{fmtNum(row.hours)}</dd>
                      <dt className="text-muted-foreground">{t('metric.coverage')}</dt>
                      <dd className="text-end font-medium">{row.coverage == null ? '—' : fmtPct(row.coverage)}</dd>
                    </dl>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey={metric}
              stroke={color}
              strokeWidth={2}
              fill={`url(#f-${gid})`}
              dot={false}
              activeDot={{ r: 4.5, strokeWidth: 2, stroke: c.surface, fill: color }}
              connectNulls={false}
              animationDuration={900}
            />
          </AreaChart>
        </ResponsiveContainer>
      </figure>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className={metric === 'coverage' ? 'h-0.5 w-4 rounded-full bg-viz-2' : 'h-0.5 w-4 rounded-full bg-viz-1'} aria-hidden />
            {t(`metric.${metric}`)}
          </span>
          {ahead.length ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-viz-faint" aria-hidden />
              {t('scheduled')}
            </span>
          ) : null}
        </span>
        <Link href="/rota" className="font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
          {t('open')}
        </Link>
      </div>
    </WidgetCard>
  );
}

export const ShiftsChart = memo(ShiftsChartInner);
export default ShiftsChart;
