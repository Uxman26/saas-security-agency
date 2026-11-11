'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CountUp } from './count-up';
import { Sparkline } from './sparkline';
import { DeltaBadge } from './delta-badge';

export type Tone = 'brand' | 'info' | 'success' | 'warning' | 'danger' | 'violet';

export const TONE_CHIP: Record<Tone, string> = {
  brand: 'bg-brand-50 text-brand-600 ring-brand-200/60 dark:ring-brand-300/30',
  info: 'bg-info-soft text-info ring-info/15',
  success: 'bg-success-soft text-success ring-success/15',
  warning: 'bg-warning-soft text-warning ring-warning/20',
  danger: 'bg-danger-soft text-danger ring-danger/20',
  violet: 'bg-indigo-50 text-indigo-600 ring-indigo-200/60 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-400/20',
};

const SPARK: Record<Tone, string> = {
  brand: 'var(--viz-1)',
  info: 'var(--viz-ontime)',
  success: 'var(--viz-2)',
  warning: 'var(--viz-late)',
  danger: 'var(--viz-absent)',
  violet: 'var(--viz-3)',
};

type Props = {
  label: string;
  value: number;
  format: (v: number) => string;
  srValue: string;
  icon: LucideIcon;
  href: string;
  tone?: Tone;
  attention?: 'warning' | 'danger' | null;
  series?: number[];
  previous?: number | null;
  deltaUnit?: 'count' | 'pct' | 'pts';
  goodWhen?: 'up' | 'down';
  deltaLabel: string;
  caption: string;
};

export function KpiCard({
  label,
  value,
  format,
  srValue,
  icon: Icon,
  href,
  tone = 'brand',
  attention,
  series,
  previous,
  deltaUnit = 'count',
  goodWhen = 'up',
  deltaLabel,
  caption,
}: Props) {
  return (
    <Link
      href={href}
      aria-label={`${label}: ${srValue}. ${caption}`}
      className={cn(
        'dash-card group/kpi relative flex h-full min-h-[9.5rem] min-w-[11.5rem] flex-col overflow-hidden p-5 outline-none transition-[transform,box-shadow] duration-300 ease-out',
        'hover:-translate-y-0.5 hover:shadow-card-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
      )}
    >
      {attention ? (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-x-0 top-0 h-[3px]',
            attention === 'danger' ? 'bg-gradient-to-r from-danger/80 via-danger/40 to-transparent' : 'bg-gradient-to-r from-warning/80 via-warning/40 to-transparent'
          )}
        />
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg ring-1', TONE_CHIP[tone])}>
            <Icon className="size-4" aria-hidden />
          </span>
          <span className="truncate text-[13px] font-medium text-muted-foreground">{label}</span>
        </div>
        <ArrowUpRight
          className="size-4 shrink-0 text-muted-foreground/0 transition-all duration-300 group-hover/kpi:text-primary rtl:-scale-x-100 group-hover/kpi:translate-x-0.5 group-hover/kpi:-translate-y-0.5"
          aria-hidden
        />
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <CountUp
            value={value}
            format={format}
            className={cn(
              'block text-[1.75rem] font-semibold leading-none tracking-tight tabular-nums text-foreground',
              attention === 'danger' && 'text-danger',
              attention === 'warning' && 'text-warning'
            )}
          />
          <span className="sr-only">{srValue}</span>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <DeltaBadge value={value} previous={previous} unit={deltaUnit} goodWhen={goodWhen} label={deltaLabel} />
            <span className="truncate text-xs text-muted-foreground">{caption}</span>
          </div>
        </div>
        {series && series.length > 1 ? <Sparkline data={series} color={SPARK[tone]} className="h-9 w-20 shrink-0 sm:w-24" /> : null}
      </div>
    </Link>
  );
}
