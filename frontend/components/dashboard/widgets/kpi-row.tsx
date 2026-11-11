'use client';

import { useTranslations } from 'next-intl';
import { Building2, CalendarRange, FileClock, MapPin, ShieldCheck, Users } from 'lucide-react';
import type { DashboardInsights } from '@/lib/types';
import { fmtDate, fmtNum, fmtPct } from '@/lib/dashboard/format';
import { KpiCard } from '../kit/kpi-card';

type Props = { kpis: DashboardInsights['kpis']; range: DashboardInsights['range']; rotasTotal?: number };

export function KpiRow({ kpis, range, rotasTotal }: Props) {
  const t = useTranslations('dashboard.kpi');
  const since = t('since', { date: fmtDate(range.previous_end) });
  const score = kpis.compliance_score;
  const cards = [
    { k: 'staff', m: kpis.staff, icon: Users, tone: 'info', href: '/guards' },
    { k: 'sites', m: kpis.sites, icon: MapPin, tone: 'success', href: '/sites' },
    { k: 'clients', m: kpis.clients, icon: Building2, tone: 'violet', href: '/clients' },
    {
      k: 'rotas',
      m: kpis.rotas_active,
      icon: CalendarRange,
      tone: 'brand',
      href: '/rota?tab=active',
      caption: rotasTotal != null ? t('rotasCaption', { total: rotasTotal }) : t('rotasCaptionPlain'),
    },
    {
      k: 'contracts',
      m: kpis.contracts_expiring,
      icon: FileClock,
      tone: kpis.contracts_expiring.value > 0 ? 'warning' : 'brand',
      href: '/clients',
      attention: kpis.contracts_expiring.value > 0 ? 'warning' : null,
      goodWhen: 'down',
    },
    score && {
      k: 'compliance',
      m: score,
      icon: ShieldCheck,
      tone: score.value >= 90 ? 'success' : score.value >= 75 ? 'warning' : 'danger',
      href: '/documents',
      attention: score.value >= 90 ? null : score.value >= 75 ? 'warning' : 'danger',
      pct: true,
    },
  ].filter(Boolean) as {
    k: string;
    m: DashboardInsights['kpis']['staff'];
    icon: typeof Users;
    tone: 'brand' | 'info' | 'success' | 'warning' | 'danger' | 'violet';
    href: string;
    attention?: 'warning' | 'danger' | null;
    goodWhen?: 'up' | 'down';
    caption?: string;
    pct?: boolean;
  }[];

  return (
    <section aria-label={t('label')} className="dash-scroll-x -mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:overflow-visible sm:px-0">
      <div className="grid auto-cols-[minmax(13rem,1fr)] grid-flow-col gap-4 sm:grid-flow-row sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {cards.map((c) => (
          <KpiCard
            key={c.k}
            label={t(c.k)}
            value={c.m.value}
            format={c.pct ? fmtPct : fmtNum}
            srValue={c.pct ? fmtPct(c.m.value) : fmtNum(c.m.value)}
            icon={c.icon}
            href={c.href}
            tone={c.tone}
            attention={c.attention}
            series={c.m.series}
            previous={c.m.previous}
            deltaUnit={c.pct ? 'pts' : 'count'}
            goodWhen={c.goodWhen}
            deltaLabel={since}
            caption={c.caption ?? t(`${c.k}Caption`)}
          />
        ))}
      </div>
    </section>
  );
}
