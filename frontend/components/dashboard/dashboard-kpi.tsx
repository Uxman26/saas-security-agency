'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import { MagicCard } from '@/components/ui/magic-card';
import { NumberTicker } from '@/components/ui/number-ticker';
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
        <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
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

/** Stats card — 21st.dev Magic Card + Number Ticker pattern. */
export function DashboardKpi({
  label,
  value,
  prefix,
  sub,
  icon: Icon,
  warn,
  accent,
  href,
  delay = 0,
}: KpiProps) {
  const clickable = Boolean(href);

  const inner = (
    <MagicCard
      className={cn(
        'h-full rounded-2xl',
        warn && '[&]:border-amber-500/40'
      )}
      gradientSize={220}
      gradientFrom={warn ? '#F59E0B' : '#E04E00'}
      gradientTo={warn ? '#FBBF24' : '#FD8018'}
      gradientColor="rgba(224,78,0,0.08)"
      gradientOpacity={0.55}
    >
      <div
        className={cn(
          'relative flex h-full min-h-[7.75rem] flex-col p-4 transition-transform duration-200',
          clickable && 'group-hover/kpi:-translate-y-0.5'
        )}
      >
        <div className="flex items-start justify-between gap-2 pe-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
            {label}
          </p>
          <div
            className={cn(
              'rounded-xl p-2 ring-1 ring-border/60',
              warn
                ? 'bg-amber-500/15 ring-amber-500/25 dark:bg-amber-500/20'
                : 'bg-muted/70 dark:bg-primary/15'
            )}
          >
            <Icon className={cn('size-4', accent ?? 'text-primary')} />
          </div>
        </div>

        <p
          className={cn(
            'mt-3 flex items-baseline gap-0.5 text-2xl font-bold tracking-tight tabular-nums sm:text-[1.65rem]',
            warn && 'text-amber-700 dark:text-amber-400'
          )}
        >
          {prefix ? <span>{prefix}</span> : null}
          <NumberTicker
            value={value}
            delay={delay}
            className={cn(
              'tracking-tight text-foreground',
              warn && 'text-amber-700 dark:text-amber-400'
            )}
          />
        </p>

        {sub ? (
          <p className="mt-auto pt-2 text-xs font-medium leading-snug text-muted-foreground line-clamp-2">
            {sub}
          </p>
        ) : (
          <div className="mt-auto" />
        )}

        {clickable ? (
          <ArrowRight className="absolute end-3 top-4 size-3.5 text-muted-foreground/60 transition-all group-hover/kpi:translate-x-0.5 group-hover/kpi:text-primary rtl:group-hover/kpi:-translate-x-0.5" />
        ) : null}
      </div>
    </MagicCard>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group/kpi block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
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
