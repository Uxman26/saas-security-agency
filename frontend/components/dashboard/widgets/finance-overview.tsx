'use client';

import { memo } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { AlertCircle } from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DashboardInsights, DashboardStats } from '@/lib/types';
import { fmtGbp, fmtGbpAxis, fmtMonth } from '@/lib/dashboard/format';
import { useVizColors } from '@/lib/dashboard/viz';
import { cn } from '@/lib/utils';
import { WidgetCard } from '../kit/widget-card';
import { DeltaBadge } from '../kit/delta-badge';
import { CountUp } from '../kit/count-up';

type Fin = NonNullable<DashboardInsights['finance']>;
const gbp = (v: number) => fmtGbp(v);

function FinanceOverviewInner({ fin, stats }: { fin: Fin; stats?: DashboardStats }) {
  const t = useTranslations('dashboard.finance');
  const locale = useLocale();
  const c = useVizColors();
  const showPayroll = fin.payroll != null;
  const tiles = [
    { k: 'invoiced', v: fin.invoiced, prev: fin.invoiced_previous, href: '/invoices', good: 'up' as const },
    { k: 'collected', v: fin.collected, prev: fin.collected_previous, href: '/payments', good: 'up' as const },
    { k: 'outstanding', v: fin.outstanding, prev: null, href: fin.overdue_count ? '/invoices?status=overdue' : '/invoices', good: 'down' as const },
    showPayroll && { k: 'payroll', v: fin.payroll ?? 0, prev: fin.payroll_previous, href: '/payroll', good: 'up' as const, neutral: true },
  ].filter(Boolean) as { k: string; v: number; prev: number | null; href: string; good: 'up' | 'down'; neutral?: boolean }[];

  const series = [
    { k: 'invoiced', cls: 'bg-viz-1' },
    { k: 'collected', cls: 'bg-viz-2' },
    ...(showPayroll ? [{ k: 'payroll', cls: 'bg-viz-3' }] : []),
  ];
  const empty = fin.months.every((m) => !m.invoiced && !m.collected && !m.payroll);

  return (
    <WidgetCard
      title={t('title')}
      subtitle={t('subtitle')}
      actions={
        <Link href="/invoices" className="rounded text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {t('open')}
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((tile) => (
          <Link
            key={tile.k}
            href={tile.href}
            className="group/f rounded-xl bg-foreground/[0.025] p-3.5 ring-1 ring-hairline transition-colors hover:bg-foreground/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-white/[0.03]"
          >
            <p className="text-xs text-muted-foreground">{t(`kpi.${tile.k}`)}</p>
            <CountUp value={tile.v} format={gbp} className="mt-1 block text-xl font-semibold tabular-nums tracking-tight" />
            <span className="sr-only">{fmtGbp(tile.v)}</span>
            <div className="mt-1.5 flex min-h-5 items-center gap-1.5">
              {tile.k === 'outstanding' && fin.overdue_amount > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-1.5 py-0.5 text-[11px] font-semibold text-danger">
                  <AlertCircle className="size-3" aria-hidden />
                  {t('overdue', { amount: fmtGbp(fin.overdue_amount), count: fin.overdue_count })}
                </span>
              ) : tile.prev != null ? (
                tile.neutral ? (
                  <span className="text-[11px] text-muted-foreground">{t('prevValue', { amount: fmtGbp(tile.prev) })}</span>
                ) : (
                  <DeltaBadge value={tile.v} previous={tile.prev} goodWhen={tile.good} label={t('vsPrevious')} />
                )
              ) : (
                <span className="text-[11px] text-muted-foreground">{t('allOpen')}</span>
              )}
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{t('chartTitle')}</p>
        <ul className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {series.map((s) => (
            <li key={s.k} className="inline-flex items-center gap-1.5">
              <span className={cn(s.k === 'payroll' ? 'h-0.5 w-3.5 rounded-full' : 'size-2.5 rounded-[3px]', s.cls)} aria-hidden />
              {t(`series.${s.k}`)}
            </li>
          ))}
        </ul>
      </div>
      <figure className="mt-2 h-[220px]" role="img" aria-label={t('aria')}>
        {empty ? (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-hairline text-sm text-muted-foreground">
            {t('empty')}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={fin.months} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barGap={2} barCategoryGap="28%">
              <CartesianGrid stroke={c.hairline} vertical={false} />
              <XAxis
                dataKey="month"
                tickFormatter={(v) => fmtMonth(v, locale)}
                tick={{ fontSize: 11, fill: c['muted-foreground'] }}
                axisLine={false}
                tickLine={false}
                reversed={locale === 'ar'}
              />
              <YAxis
                orientation={locale === 'ar' ? 'right' : 'left'}
                tickFormatter={fmtGbpAxis}
                tick={{ fontSize: 11, fill: c['muted-foreground'] }}
                axisLine={false}
                tickLine={false}
                width={56}
                tickCount={5}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: c['viz-faint'], fillOpacity: 0.5 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="rounded-lg bg-popover px-3 py-2 text-xs shadow-pop ring-1 ring-hairline">
                      <p className="font-semibold">{fmtMonth(String(label), locale)} {String(label).slice(0, 4)}</p>
                      <dl className="mt-1.5 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 tabular-nums">
                        {series.map((s) => {
                          const v = payload.find((p) => p.dataKey === s.k)?.value;
                          return (
                            <div key={s.k} className="contents">
                              <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                                <span className={cn('size-2 rounded-[2px]', s.cls)} aria-hidden />
                                {t(`series.${s.k}`)}
                              </dt>
                              <dd className="text-end font-medium">{fmtGbp(Number(v ?? 0))}</dd>
                            </div>
                          );
                        })}
                      </dl>
                    </div>
                  );
                }}
              />
              <Bar dataKey="invoiced" fill={c['viz-1']} radius={[4, 4, 0, 0]} maxBarSize={22} animationDuration={800} />
              <Bar dataKey="collected" fill={c['viz-2']} radius={[4, 4, 0, 0]} maxBarSize={22} animationDuration={800} />
              {showPayroll ? (
                <Line
                  dataKey="payroll"
                  type="monotone"
                  stroke={c['viz-3']}
                  strokeWidth={2}
                  dot={{ r: 3, strokeWidth: 2, stroke: c.surface, fill: c['viz-3'] }}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: c.surface }}
                  animationDuration={900}
                />
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </figure>
      <p className="mt-3 text-xs text-muted-foreground">
        {showPayroll && stats
          ? t('footer', {
              invoiced: fmtGbp(fin.invoiced_all_time),
              payroll: fmtGbp(stats.revenue_total),
              mtd: fmtGbp(stats.payroll_mtd),
            })
          : t('footerInvoiced', { invoiced: fmtGbp(fin.invoiced_all_time) })}
      </p>
    </WidgetCard>
  );
}

export const FinanceOverview = memo(FinanceOverviewInner);
export default FinanceOverview;
