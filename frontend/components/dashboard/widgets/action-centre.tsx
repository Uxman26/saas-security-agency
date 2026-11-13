'use client';

import { memo, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AlertOctagon, AlertTriangle, BellRing, CheckCircle2, Info, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { api } from '@/lib/api';
import { canModule } from '@/lib/permissions';
import { toast, toastMutationError } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { daysUntil, fmtDate, fmtGbp } from '@/lib/dashboard/format';
import type { ComplianceAlert, ContractExpiryAlert, DashboardInsights } from '@/lib/types';
import { WidgetCard } from '../kit/widget-card';
import { EmptyState } from '../kit/empty-state';
import { Segmented } from '../kit/segmented';

type Severity = 'critical' | 'warning' | 'info';
type Group = 'compliance' | 'requests' | 'invoices';
type Item = {
  id: string;
  group: Group;
  severity: Severity;
  title: string;
  detail: string;
  badge: string;
  rank: number;
  href: string;
  invoiceId?: number;
};

type Props = {
  documents: ComplianceAlert[];
  contracts: ContractExpiryAlert[];
  sia: DashboardInsights['sia_alerts'];
  requests: DashboardInsights['staff_requests'];
  invoices: NonNullable<DashboardInsights['finance']>['overdue_invoices'] | null;
  partial: boolean;
};

const SEV: Record<Severity, { icon: typeof Info; cls: string; order: number }> = {
  critical: { icon: AlertOctagon, cls: 'bg-danger-soft text-danger', order: 0 },
  warning: { icon: AlertTriangle, cls: 'bg-warning-soft text-warning', order: 1 },
  info: { icon: Info, cls: 'bg-info-soft text-info', order: 2 },
};

const expirySeverity = (d: number): Severity => (d <= 7 ? 'critical' : d <= 30 ? 'warning' : 'info');

function ActionCentreInner({ documents, contracts, sia, requests, invoices, partial }: Props) {
  const t = useTranslations('dashboard.actions');
  const { user } = useAuth();
  const [tab, setTab] = useState<'all' | Group>('all');
  const [sending, setSending] = useState<number | null>(null);
  const canRemind = canModule(user, 'invoices', 'send');

  const items = useMemo(() => {
    const out: Item[] = [];
    const expiryBadge = (d: number) => (d < 0 ? t('badge.expired', { days: -d }) : d === 0 ? t('badge.today') : t('badge.in', { days: d }));
    documents.forEach((a, i) => {
      const d = daysUntil(a.expiry_date);
      out.push({
        id: `doc-${a.guard_id}-${i}`,
        group: 'compliance',
        severity: expirySeverity(d),
        title: a.guard_name,
        detail: t('detail.document', { type: a.document_type, date: fmtDate(a.expiry_date) }),
        badge: expiryBadge(d),
        rank: d,
        href: `/guards/${a.guard_id}`,
      });
    });
    (sia ?? []).forEach((a) => {
      const d = daysUntil(a.expiry_date);
      out.push({
        id: `sia-${a.guard_id}`,
        group: 'compliance',
        severity: expirySeverity(d),
        title: a.guard_name,
        detail: t('detail.sia', { date: fmtDate(a.expiry_date) }),
        badge: expiryBadge(d),
        rank: d,
        href: `/guards/${a.guard_id}`,
      });
    });
    contracts.forEach((a) => {
      const d = daysUntil(a.contract_end_date);
      out.push({
        id: `con-${a.client_id}`,
        group: 'compliance',
        severity: d <= 7 ? 'critical' : 'warning',
        title: a.client_name,
        detail: t('detail.contract', { date: fmtDate(a.contract_end_date) }),
        badge: expiryBadge(d),
        rank: d,
        href: '/clients',
      });
    });
    (requests?.items ?? []).forEach((r) => {
      const d = daysUntil(r.shift_date);
      out.push({
        id: `req-${r.id}`,
        group: 'requests',
        severity: d <= 2 ? 'warning' : 'info',
        title: r.client_name || r.site_name,
        detail: t('detail.request', {
          count: r.staff_count,
          site: r.site_name,
          date: fmtDate(r.shift_date),
          time: `${r.shift_start}–${r.shift_end}`,
        }),
        badge: d <= 0 ? t('badge.today') : t('badge.in', { days: d }),
        rank: d,
        href: '/requests',
      });
    });
    (invoices ?? []).forEach((v) => {
      out.push({
        id: `inv-${v.id}`,
        group: 'invoices',
        severity: v.days_overdue > 30 ? 'critical' : 'warning',
        title: v.client_name || t('detail.invoiceNo', { id: v.id }),
        detail: t('detail.invoice', { id: v.id, amount: fmtGbp(v.outstanding, true), date: fmtDate(v.due_date) }),
        badge: t('badge.overdue', { days: v.days_overdue }),
        rank: -v.days_overdue,
        href: `/invoices/${v.id}/view`,
        invoiceId: v.id,
      });
    });
    return out.sort((a, b) => SEV[a.severity].order - SEV[b.severity].order || a.rank - b.rank);
  }, [documents, contracts, sia, requests, invoices, t]);

  const count = (g: Group) => items.filter((i) => i.group === g).length;
  const list = tab === 'all' ? items : items.filter((i) => i.group === tab);
  const critical = items.filter((i) => i.severity === 'critical').length;

  const remind = async (id: number) => {
    setSending(id);
    try {
      const r = await api.invoices.sendReminder(id);
      toast.success(r.message);
    } catch (e) {
      toastMutationError(e, t('remindFailed'));
    } finally {
      setSending(null);
    }
  };

  const tabs = [
    { value: 'all' as const, label: t('tab.all'), badge: items.length },
    { value: 'compliance' as const, label: t('tab.compliance'), badge: count('compliance') },
    ...(requests ? [{ value: 'requests' as const, label: t('tab.requests'), badge: count('requests') }] : []),
    ...(invoices ? [{ value: 'invoices' as const, label: t('tab.invoices'), badge: count('invoices') }] : []),
  ];

  return (
    <WidgetCard
      title={t('title')}
      subtitle={critical ? t('subtitleCritical', { count: critical }) : t('subtitle')}
      bodyClassName="flex flex-col"
    >
      <div className="dash-scroll-x -mx-1 -my-1 mb-2 overflow-x-auto px-1 py-1">
        <Segmented label={t('tabsLabel')} value={tab} onChange={setTab} options={tabs} />
      </div>
      {!list.length ? (
        <EmptyState icon={CheckCircle2} tone="success" title={t(`empty.${tab}`)} hint={t('emptyHint')} />
      ) : (
        <ul className="-mx-1 max-h-[24rem] space-y-1 overflow-y-auto px-1">
          {list.map((it) => {
            const { icon: Icon, cls } = SEV[it.severity];
            return (
              <li key={it.id} className="group/a flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-foreground/[0.03]">
                <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', cls)}>
                  <Icon className="size-4" aria-hidden />
                  <span className="sr-only">{t(`severity.${it.severity}`)}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{it.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{it.detail}</p>
                </div>
                <span className={cn('hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums sm:inline', cls)}>
                  {it.badge}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  {it.invoiceId && canRemind ? (
                    <button
                      type="button"
                      onClick={() => void remind(it.invoiceId!)}
                      disabled={sending === it.invoiceId}
                      className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-foreground/80 ring-1 ring-hairline transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                    >
                      {sending === it.invoiceId ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <BellRing className="size-3.5" aria-hidden />}
                      {t('remind')}
                    </button>
                  ) : null}
                  <Link
                    href={it.href}
                    className="inline-flex h-7 items-center rounded-md px-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`${t('view')}: ${it.title}`}
                  >
                    {t('view')}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {partial ? <p className="mt-3 text-[11px] text-muted-foreground">{t('partial')}</p> : null}
    </WidgetCard>
  );
}

export const ActionCentre = memo(ActionCentreInner);
export default ActionCentre;
