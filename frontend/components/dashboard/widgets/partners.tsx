'use client';

import { memo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { DashboardInsights, DashboardStats } from '@/lib/types';
import { fmtGbp, fmtPct } from '@/lib/dashboard/format';
import { WidgetCard } from '../kit/widget-card';
import { Avatar } from './avatar';

type Props = {
  stats?: DashboardStats;
  clients: NonNullable<DashboardInsights['finance']>['top_clients'] | null;
  showContractors: boolean;
};

function Meter({ label, active, total, href }: { label: string; active: number; total: number; href: string }) {
  const t = useTranslations('dashboard.partners');
  const pct = total ? (active / total) * 100 : 0;
  return (
    <Link href={href} className="block rounded-lg p-1 -m-1 transition-colors hover:bg-foreground/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">{t('active', { active, total })}</span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={active}
        aria-label={label}
      >
        <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-500 transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
    </Link>
  );
}

function PartnersInner({ stats, clients, showContractors }: Props) {
  const t = useTranslations('dashboard.partners');
  return (
    <WidgetCard title={t('title')} subtitle={t('subtitle')}>
      <div className="space-y-5">
        {showContractors && stats ? (
          <div className="space-y-3.5">
            <Meter label={t('main')} active={stats.main_contractors_active} total={stats.main_contractors_total} href="/contractors" />
            <Meter label={t('sub')} active={stats.sub_contractors_active} total={stats.sub_contractors_total} href="/contractors" />
          </div>
        ) : null}
        {clients ? (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">{t('topClients')}</p>
            {clients.length ? (
              <ol className="space-y-2">
                {clients.map((c) => (
                  <li key={c.id}>
                    <Link href="/clients" className="flex items-center gap-2.5 rounded-lg p-1 -m-1 transition-colors hover:bg-foreground/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <Avatar name={c.name} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2 text-[13px]">
                          <span className="truncate font-medium">{c.name}</span>
                          <span className="shrink-0 font-semibold tabular-nums">{fmtGbp(c.revenue)}</span>
                        </span>
                        <span className="mt-1 flex items-center gap-2">
                          <span className="h-1 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]">
                            <span className="block h-full rounded-full bg-viz-1" style={{ width: `${c.share}%` }} />
                          </span>
                          <span className="w-10 text-end text-[11px] tabular-nums text-muted-foreground">{fmtPct(c.share)}</span>
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-muted-foreground">{t('noRevenue')}</p>
            )}
          </div>
        ) : null}
      </div>
    </WidgetCard>
  );
}

export const Partners = memo(PartnersInner);
export default Partners;
