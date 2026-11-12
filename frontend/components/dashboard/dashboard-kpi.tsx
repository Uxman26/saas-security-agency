'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight } from 'lucide-react';
import { CountUp } from '@/components/dashboard/kit/count-up';
import { fmtNum } from '@/lib/dashboard/format';
import { cn } from '@/lib/utils';

export function DashboardSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-3', className)}>
      <div>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground/80">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

type KpiProps = {
  label: string;
  value: number;
  /** Prefix shown before animated number (e.g. £). */
  prefix?: string;
  sub?: string;
  icon: LucideIcon;
  warn?: boolean;
  accent?: string;
  href?: string;
  delay?: number;
};

export function DashboardKpi({
  label,
  value,
  prefix,
  sub,
  icon: Icon,
  warn,
  accent,
  href,
}: KpiProps) {
  const format = useCallback((v: number) => `${prefix ?? ''}${fmtNum(v)}`, [prefix]);
  const inner = (
    <div
      className={cn(
        'dash-card relative flex h-full min-h-[8.5rem] flex-col overflow-hidden p-5 transition-[transform,box-shadow] duration-300 ease-out',
        href && 'group-hover/kpi:-translate-y-0.5 group-hover/kpi:shadow-card-hover'
      )}
    >
      {warn ? (
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-warning/80 via-warning/40 to-transparent" />
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-lg ring-1',
              warn ? 'bg-warning-soft text-warning ring-warning/20' : 'bg-brand-50 ring-brand-200/60 dark:ring-brand-300/30'
            )}
          >
            <Icon className={cn('size-4', warn ? 'text-warning' : accent ?? 'text-brand-600')} />
          </span>
          <p className="truncate text-[13px] font-medium text-muted-foreground">{label}</p>
        </div>
        {href ? (
          <ArrowUpRight className="size-4 shrink-0 text-muted-foreground/0 transition-all group-hover/kpi:text-primary rtl:-scale-x-100" aria-hidden />
        ) : null}
      </div>
      <p className={cn('mt-4 text-[1.625rem] font-semibold leading-none tracking-tight tabular-nums', warn ? 'text-warning' : 'text-foreground')}>
        <CountUp value={value} format={format} />
        <span className="sr-only">{`${prefix ?? ''}${fmtNum(value)}`}</span>
      </p>
      {sub ? <p className="mt-auto pt-2.5 text-xs text-muted-foreground line-clamp-2">{sub}</p> : null}
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group/kpi block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {inner}
      </Link>
    );
  }

  return inner;
}

export const KPI_GRID = 'grid grid-cols-12 gap-3';
export const KPI_SPAN_SIXTH = 'col-span-6 sm:col-span-4 lg:col-span-2';
export const KPI_SPAN_QUARTER = 'col-span-6 lg:col-span-3';
export const KPI_SPAN_HALF = 'col-span-12 sm:col-span-6';
