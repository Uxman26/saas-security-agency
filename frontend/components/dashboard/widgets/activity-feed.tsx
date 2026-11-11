'use client';

import { memo } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { AlarmClock, FileUp, History, LogIn, LogOut, PoundSterling, ShieldAlert, UserPlus, type LucideIcon } from 'lucide-react';
import type { ActivityType, DashboardInsights } from '@/lib/types';
import { fmtDate, fmtGbp, fmtRelative } from '@/lib/dashboard/format';
import { cn } from '@/lib/utils';
import { WidgetCard } from '../kit/widget-card';
import { EmptyState } from '../kit/empty-state';

const ICON: Record<ActivityType, { icon: LucideIcon; cls: string }> = {
  clock_in: { icon: LogIn, cls: 'bg-info-soft text-info' },
  clock_in_late: { icon: AlarmClock, cls: 'bg-warning-soft text-warning' },
  clock_out: { icon: LogOut, cls: 'bg-muted text-muted-foreground' },
  incident: { icon: ShieldAlert, cls: 'bg-danger-soft text-danger' },
  document: { icon: FileUp, cls: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300' },
  payment: { icon: PoundSterling, cls: 'bg-success-soft text-success' },
  request: { icon: UserPlus, cls: 'bg-brand-50 text-brand-600' },
};

const human = (s: string) => s.replace(/_/g, ' ');

function ActivityFeedInner({ items }: { items: DashboardInsights['activity'] }) {
  const t = useTranslations('dashboard.activity');
  const locale = useLocale();

  return (
    <WidgetCard title={t('title')} subtitle={t('subtitle')}>
      {!items.length ? (
        <EmptyState icon={History} title={t('empty')} hint={t('emptyHint')} />
      ) : (
        <ol className="relative max-h-[26rem] space-y-1 overflow-y-auto pe-1">
          {items.map((e, i) => {
            const { icon: Icon, cls } = ICON[e.type] ?? ICON.clock_out;
            const key = e.type === 'incident' && !e.actor ? 'incidentNoSite' : e.type;
            const text = t(`event.${key}`, {
              actor: e.actor || t('someone'),
              target: e.type === 'request' ? fmtDate(e.target) : human(e.target || ''),
              amount: fmtGbp(e.amount ?? 0, true),
            });
            return (
              <li key={`${e.type}-${e.at}-${i}`} className="relative">
                {i < items.length - 1 ? (
                  <span aria-hidden className="absolute start-[17px] top-10 bottom-[-6px] w-px bg-hairline" />
                ) : null}
                <Link
                  href={e.href}
                  className="flex items-start gap-3 rounded-lg p-1.5 transition-colors hover:bg-foreground/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className={cn('relative z-[1] flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-surface', cls)}>
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 pt-0.5">
                    <span className="block text-[13px] leading-snug text-foreground">{text}</span>
                    <time dateTime={e.at} className="mt-0.5 block text-[11px] text-muted-foreground" title={new Date(e.at).toLocaleString('en-GB')}>
                      {fmtRelative(e.at, locale)}
                    </time>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </WidgetCard>
  );
}

export const ActivityFeed = memo(ActivityFeedInner);
export default ActivityFeed;
