'use client';

import { TrendingUp, Users, Calendar, AlertTriangle, PoundSterling, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

type Stat = { label: string; value: string; change?: string; trend?: 'up' | 'down' | 'warn' };
type Shift = { site: string; time: string; staff: string; status: string };

type Props = {
  label: string;
  stats: Stat[];
  shifts: Shift[];
  chartLabel: string;
  revenueLabel: string;
  revenueValue: string;
  shiftsTitle: string;
};

const ICONS = [Calendar, Users, AlertTriangle, PoundSterling];

function MiniChart() {
  const bars = [38, 52, 45, 68, 58, 72, 64, 80, 74, 88, 82, 94];
  return (
    <div className="flex items-end gap-1 h-24 pt-2">
      {bars.map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-sm bg-gradient-to-t from-primary/80 to-[#FD8018] opacity-90"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

export function MarketingDashboardPreview({
  label,
  stats,
  shifts,
  chartLabel,
  revenueLabel,
  revenueValue,
  shiftsTitle,
}: Props) {
  return (
    <div className="relative">
      <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-primary/20 via-primary/5 to-transparent blur-2xl pointer-events-none" />
      <div className="absolute -top-6 -end-6 size-32 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <div className="relative rounded-2xl border border-primary/25 bg-card shadow-2xl shadow-primary/15 overflow-hidden ring-1 ring-primary/10">
        <div className="bg-gradient-to-r from-[#161E2C] to-[#1F2937] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-3 rounded-full bg-red-400/90" />
            <div className="size-3 rounded-full bg-amber-400/90" />
            <div className="size-3 rounded-full bg-green-400/90" />
          </div>
          <span className="text-xs font-medium text-white/80">{label}</span>
          <div className="size-6 rounded-md bg-primary/20 border border-primary/30" />
        </div>
        <div className="p-4 space-y-4 bg-gradient-to-br from-background via-background to-muted/40">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {stats.map((s, i) => {
              const Icon = ICONS[i];
              return (
                <div
                  key={s.label}
                  className={cn(
                    'rounded-xl border bg-card p-3 shadow-sm',
                    s.trend === 'warn' ? 'border-amber-500/30 bg-amber-500/5' : 'border-border/60'
                  )}
                >
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground leading-tight">
                      {s.label}
                    </p>
                    <Icon className={cn('size-3.5 shrink-0', s.trend === 'warn' ? 'text-amber-500' : 'text-primary')} />
                  </div>
                  <p className={cn('mt-1.5 text-xl font-bold tabular-nums', s.trend === 'warn' ? 'text-amber-600' : 'text-foreground')}>
                    {s.value}
                  </p>
                  {s.change && (
                    <p className={cn('mt-0.5 text-[10px] font-medium flex items-center gap-0.5', s.trend === 'up' ? 'text-emerald-600' : 'text-muted-foreground')}>
                      {s.trend === 'up' && <TrendingUp className="size-3" />}
                      {s.change}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <div className="grid sm:grid-cols-5 gap-3">
            <div className="sm:col-span-3 rounded-xl border border-border/60 bg-card p-3 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-foreground">{chartLabel}</p>
                <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-0.5">
                  <TrendingUp className="size-3" /> +18%
                </span>
              </div>
              <MiniChart />
            </div>
            <div className="sm:col-span-2 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 p-3 shadow-sm">
              <p className="text-xs font-medium text-muted-foreground">{revenueLabel}</p>
              <p className="mt-1 text-2xl font-bold marketing-gradient-text tabular-nums">{revenueValue}</p>
              <div className="mt-3 h-1.5 rounded-full bg-primary/20 overflow-hidden">
                <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-primary to-[#DF3C01]" />
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground">72% of monthly target</p>
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <div className="px-3 py-2 border-b bg-muted/30 text-xs font-semibold text-foreground">
              {shiftsTitle}
            </div>
            <div className="divide-y divide-border/50">
              {shifts.map((shift) => (
                <div key={shift.site + shift.time} className="flex items-center gap-3 px-3 py-2.5 text-xs">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-[10px]">
                    {shift.staff.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{shift.site}</p>
                    <p className="text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="size-3 shrink-0" /> {shift.time}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-medium">
                    {shift.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
