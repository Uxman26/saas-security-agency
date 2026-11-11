'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarPlus, FilePlus2, LayoutGrid, RotateCw, ShieldAlert, UserPlus } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { canModule } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { fmtRelative } from '@/lib/dashboard/format';
import { presetRange, type DashRange, type RangePreset } from '@/lib/dashboard/range';
import { Segmented } from './kit/segmented';

type Props = {
  range: DashRange;
  onRange: (r: DashRange) => void;
  updatedAt: number;
  refreshing: boolean;
  degraded: boolean;
  onRefresh: () => void;
  onCustomise: () => void;
};

const ACTIONS = [
  { key: 'createShift', href: '/rota/create', icon: CalendarPlus, mod: 'rota', act: 'create' },
  { key: 'addStaff', href: '/guards?new=1', icon: UserPlus, mod: 'guards', act: 'create' },
  { key: 'newIncident', href: '/incidents', icon: ShieldAlert, mod: 'incidents', act: 'create' },
  { key: 'generateInvoice', href: '/invoices', icon: FilePlus2, mod: 'invoices', act: 'create' },
] as const;

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

export function CommandHeader({ range, onRange, updatedAt, refreshing, degraded, onRefresh, onCustomise }: Props) {
  const t = useTranslations('dashboard');
  const locale = useLocale();
  const { user } = useAuth();
  const now = useNow();
  const hour = new Date(now).getHours();
  const greet = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const first = (user?.full_name || '').trim().split(/\s+/)[0];
  const today = new Date(now).toLocaleDateString(locale === 'ar' ? 'ar' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const actions = useMemo(() => ACTIONS.filter((a) => canModule(user, a.mod, a.act)), [user]);
  const presets: { value: RangePreset; label: string }[] = [
    { value: 'today', label: t('range.today') },
    { value: '7d', label: t('range.7d') },
    { value: '30d', label: t('range.30d') },
    { value: '90d', label: t('range.90d') },
    { value: 'custom', label: t('range.custom') },
  ];

  return (
    <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-muted-foreground">
          {today}
          {user?.company_name ? <span className="text-muted-foreground/70"> · {user.company_name}</span> : null}
        </p>
        <h1 className="mt-1.5 text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-[2rem]">
          {first ? t(`greeting.${greet}`, { name: first }) : t(`greeting.${greet}Plain`)}
        </h1>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 font-medium ring-1 ring-hairline">
            <span className={cn('relative flex size-2 rounded-full', degraded ? 'bg-warning text-warning' : 'dash-live-dot bg-success text-success')} />
            {degraded ? t('status.degraded') : t('status.healthy')}
          </span>
          {updatedAt ? (
            <span aria-live="polite">{t('status.updated', { when: fmtRelative(new Date(updatedAt).toISOString(), locale, now) })}</span>
          ) : null}
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-foreground/80 transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            <RotateCw className={cn('size-3.5', refreshing && 'animate-spin')} aria-hidden />
            {t('status.refresh')}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 xl:items-end">
        {actions.length ? (
          <nav aria-label={t('cta.label')} className="dash-scroll-x -mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
            {actions.map(({ key, href, icon: Icon }, i) => (
              <Link
                key={key}
                href={href}
                className={cn(
                  'inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3.5 text-[13px] font-medium outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  i === 0
                    ? 'bg-primary text-primary-foreground shadow-[0_6px_16px_-6px_rgb(244_81_0/0.6)] hover:bg-primary-hover'
                    : 'bg-surface text-foreground ring-1 ring-hairline shadow-card hover:shadow-card-hover'
                )}
              >
                <Icon className="size-4" aria-hidden />
                {t(`cta.${key}`)}
              </Link>
            ))}
          </nav>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <div className="dash-scroll-x max-w-full overflow-x-auto">
            <Segmented
              label={t('range.label')}
              value={range.preset}
              options={presets}
              size="md"
              onChange={(p) => onRange(p === 'custom' ? { ...range, preset: 'custom' } : presetRange(p))}
            />
          </div>
          {range.preset === 'custom' ? (
            <div className="flex items-center gap-1.5 text-xs">
              <label className="sr-only" htmlFor="dash-from">{t('range.from')}</label>
              <input
                id="dash-from"
                type="date"
                value={range.start}
                max={range.end}
                onChange={(e) => e.target.value && onRange({ ...range, start: e.target.value })}
                className="h-8 rounded-md border border-hairline bg-surface px-2 text-xs"
              />
              <span aria-hidden>–</span>
              <label className="sr-only" htmlFor="dash-to">{t('range.to')}</label>
              <input
                id="dash-to"
                type="date"
                value={range.end}
                min={range.start}
                onChange={(e) => e.target.value && onRange({ ...range, end: e.target.value })}
                className="h-8 rounded-md border border-hairline bg-surface px-2 text-xs"
              />
            </div>
          ) : null}
          <button
            type="button"
            onClick={onCustomise}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-surface px-3 text-[13px] font-medium text-foreground/80 ring-1 ring-hairline transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LayoutGrid className="size-4" aria-hidden />
            {t('customise.button')}
          </button>
        </div>
      </div>
    </header>
  );
}
