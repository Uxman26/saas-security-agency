'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { MotionConfig, motion } from 'motion/react';
import { ADMIN_HOME } from '@/lib/admin-nav';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/contexts/auth-context';
import { can, PERMS } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { useDashboardAlerts, useDashboardInsights, useDashboardOverview } from '@/hooks/use-dashboard';
import { presetRange, rangeDays, type DashRange } from '@/lib/dashboard/range';
import { useDashboardLayout, WIDGETS, type WidgetId } from '@/lib/dashboard/layout';
import { CommandHeader } from '@/components/dashboard/command-header';
import { CustomiseDialog } from '@/components/dashboard/customise-dialog';
import { SkeletonCard, Shimmer } from '@/components/dashboard/kit/skeleton-card';
import { WidgetBoundary, WidgetError } from '@/components/dashboard/kit/widget-boundary';
import { LiveStrip } from '@/components/dashboard/widgets/live-strip';
import { KpiRow } from '@/components/dashboard/widgets/kpi-row';
import { SitesToday } from '@/components/dashboard/widgets/sites-today';
import { ActionCentre } from '@/components/dashboard/widgets/action-centre';
import { ActivityFeed } from '@/components/dashboard/widgets/activity-feed';
import { TodayShifts } from '@/components/dashboard/widgets/today-shifts';
import { Partners } from '@/components/dashboard/widgets/partners';

const chartSkeleton = () => <SkeletonCard className="h-full min-h-[26rem]" rows={6} />;
const ShiftsChart = dynamic(() => import('@/components/dashboard/widgets/shifts-chart'), { ssr: false, loading: chartSkeleton });
const AttendanceDonut = dynamic(() => import('@/components/dashboard/widgets/attendance-donut'), { ssr: false, loading: chartSkeleton });
const FinanceOverview = dynamic(() => import('@/components/dashboard/widgets/finance-overview'), { ssr: false, loading: chartSkeleton });

const SPAN = Object.fromEntries(WIDGETS.map((w) => [w.id, w.span])) as Record<WidgetId, string>;

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6" aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="dash-card flex min-h-[9.5rem] flex-col gap-4 p-5">
          <Shimmer className="h-8 w-28" />
          <Shimmer className="h-7 w-20" />
          <Shimmer className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const { user } = useAuth();
  const router = useRouter();
  const isSuperAdmin = user?.role === 'super_admin';

  useEffect(() => {
    if (isSuperAdmin) router.replace(ADMIN_HOME);
  }, [isSuperAdmin, router]);

  const enabled = !isSuperAdmin && Boolean(user);
  const [range, setRange] = useState<DashRange>(() => presetRange('30d'));
  const validRange = range.start <= range.end && rangeDays(range) <= 366;
  const insights = useDashboardInsights(range.start, range.end, enabled && validRange);
  const overview = useDashboardOverview(enabled, true);
  const alerts = useDashboardAlerts(enabled, true);
  const { layout, save, reset } = useDashboardLayout(user?.id);
  const [customise, setCustomise] = useState(false);

  const d = insights.data;
  const stats = overview.data?.stats;
  const showContractors = can(user, PERMS.contractorView);

  const available = useMemo(() => {
    const s = new Set<WidgetId>(WIDGETS.map((w) => w.id));
    if (d && !d.finance) s.delete('finance');
    if (d && !d.finance && !showContractors) s.delete('partners');
    return s;
  }, [d, showContractors]);

  const refreshing = insights.isFetching || overview.isFetching || alerts.isFetching;
  const refresh = useCallback(() => {
    void insights.refetch();
    void overview.refetch();
    void alerts.refetch();
  }, [insights, overview, alerts]);
  const updatedAt = Math.max(insights.dataUpdatedAt, overview.dataUpdatedAt, alerts.dataUpdatedAt);
  const degraded = insights.isError || overview.isError || alerts.isError;

  const failed = (title: string) => (
    <WidgetError title={title} message={t('error.message')} retryLabel={t('error.retry')} onRetry={() => void insights.refetch()} />
  );

  const needInsights = (title: string, skeleton: ReactNode, body: () => ReactNode) =>
    d ? body() : insights.isError || !validRange ? failed(title) : skeleton;

  const render = (id: WidgetId): ReactNode => {
    const title = t(`widgets.${id}`);
    switch (id) {
      case 'live':
        return needInsights(title, <Shimmer className="h-[5.5rem] rounded-2xl" />, () => <LiveStrip live={d!.live} />);
      case 'kpis':
        return needInsights(title, <KpiSkeleton />, () => <KpiRow kpis={d!.kpis} range={d!.range} rotasTotal={stats?.rotas_total} />);
      case 'shifts':
        return needInsights(title, chartSkeleton(), () => <ShiftsChart data={d!.shifts} today={d!.range.today} />);
      case 'attendance':
        return needInsights(title, chartSkeleton(), () => <AttendanceDonut data={d!.attendance} />);
      case 'finance':
        return needInsights(title, chartSkeleton(), () => <FinanceOverview fin={d!.finance!} stats={stats} />);
      case 'sites':
        return needInsights(title, <SkeletonCard className="h-full" rows={6} />, () => <SitesToday shifts={d!.today_shifts} />);
      case 'actions':
        return needInsights(title, <SkeletonCard className="h-full min-h-80" rows={6} />, () => (
          <ActionCentre
            documents={alerts.data?.compliance ?? []}
            contracts={alerts.data?.contracts ?? []}
            sia={d!.sia_alerts}
            requests={d!.staff_requests}
            invoices={d!.finance?.overdue_invoices ?? null}
            partial={alerts.isError}
          />
        ));
      case 'activity':
        return needInsights(title, <SkeletonCard className="h-full min-h-80" rows={6} />, () => <ActivityFeed items={d!.activity} />);
      case 'today':
        return needInsights(title, <SkeletonCard className="h-full min-h-80" rows={6} />, () => <TodayShifts shifts={d!.today_shifts} />);
      case 'partners':
        return needInsights(title, <SkeletonCard className="h-full" rows={4} />, () => (
          <Partners stats={stats} clients={d!.finance?.top_clients ?? null} showContractors={showContractors} />
        ));
    }
  };

  const visible = layout.order.filter((id) => available.has(id) && !layout.hidden.includes(id));

  return (
    <ProtectedRoute>
      <AppShell>
        <MotionConfig reducedMotion="user">
          <div className="dash-canvas dash-motion min-h-full">
            <div className="w-full space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 xl:px-10">
              <CommandHeader
                range={range}
                onRange={setRange}
                updatedAt={updatedAt}
                refreshing={refreshing}
                degraded={degraded}
                onRefresh={refresh}
                onCustomise={() => setCustomise(true)}
              />
              {!validRange ? (
                <p role="alert" className="rounded-lg bg-warning-soft px-3 py-2 text-xs font-medium text-warning">
                  {t('range.invalid')}
                </p>
              ) : null}
              <div className="grid grid-cols-1 gap-5 lg:grid-flow-dense lg:grid-cols-12">
                {visible.map((id, i) => (
                  <motion.div
                    key={id}
                    layout="position"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: Math.min(i, 8) * 0.05, ease: [0.16, 1, 0.3, 1] }}
                    className={cn('min-w-0', SPAN[id])}
                  >
                    <WidgetBoundary title={t(`widgets.${id}`)} message={t('error.message')} retryLabel={t('error.retry')}>
                      {render(id)}
                    </WidgetBoundary>
                  </motion.div>
                ))}
              </div>
              {!visible.length ? (
                <div className="dash-card p-10 text-center text-sm text-muted-foreground">
                  {t('customise.allHidden')}{' '}
                  <button type="button" onClick={reset} className="font-semibold text-primary hover:underline">
                    {t('customise.reset')}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <CustomiseDialog open={customise} onOpenChange={setCustomise} layout={layout} available={available} onChange={save} onReset={reset} />
        </MotionConfig>
      </AppShell>
    </ProtectedRoute>
  );
}
