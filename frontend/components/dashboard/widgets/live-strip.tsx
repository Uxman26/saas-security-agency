'use client';

import { useTranslations } from 'next-intl';
import { Activity, AlarmClock, PersonStanding, ShieldAlert, UserCheck, UserX } from 'lucide-react';
import type { DashboardInsights } from '@/lib/types';
import { StatPill } from '../kit/stat-pill';

export function LiveStrip({ live }: { live: DashboardInsights['live'] }) {
  const t = useTranslations('dashboard.live');
  const items = [
    { k: 'present', v: live.present, icon: UserCheck, tone: 'success', href: '/attendance', live: true },
    { k: 'late', v: live.late, icon: AlarmClock, tone: 'warning', href: '/attendance', emphasise: true },
    { k: 'absent', v: live.absent, icon: UserX, tone: 'danger', href: '/attendance', emphasise: true },
    { k: 'inProgress', v: live.in_progress, icon: Activity, tone: 'info', href: '/rota', live: true },
    live.open_incidents != null && { k: 'openIncidents', v: live.open_incidents, icon: ShieldAlert, tone: 'danger', href: '/incidents?status=open', emphasise: true },
    live.lone_workers_active != null && { k: 'loneWorkers', v: live.lone_workers_active, icon: PersonStanding, tone: 'violet', href: '/lone-worker', live: true },
  ].filter(Boolean) as {
    k: string;
    v: number;
    icon: typeof Activity;
    tone: 'success' | 'warning' | 'danger' | 'info' | 'violet';
    href: string;
    live?: boolean;
    emphasise?: boolean;
  }[];

  return (
    <section aria-labelledby="dash-live" className="dash-glass p-1.5">
      <div className="flex items-center gap-2 px-3.5 pt-2.5 pb-1">
        <span className="dash-live-dot relative flex size-2 rounded-full bg-success text-success" aria-hidden />
        <h2 id="dash-live" className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {t('title')}
        </h2>
        <span className="text-xs text-muted-foreground/80">· {t('shiftsToday', { count: live.shifts_today })}</span>
      </div>
      <div className="dash-scroll-x flex snap-x gap-1 overflow-x-auto">
        {items.map((i) => (
          <div key={i.k} className="flex flex-1 snap-start">
            <StatPill label={t(i.k)} value={i.v} icon={i.icon} tone={i.tone} href={i.href} live={i.live} emphasise={i.emphasise} />
          </div>
        ))}
      </div>
    </section>
  );
}
