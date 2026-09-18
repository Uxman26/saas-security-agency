'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import type { AdminHqSnapshot, OpsHealth } from '@/lib/types';
import { toast } from '@/lib/toast';
import {
  DashboardKpi,
  DashboardSection,
  KPI_GRID,
  KPI_SPAN_QUARTER,
} from '@/components/dashboard/dashboard-kpi';
import { DashboardHero } from '@/components/dashboard/dashboard-hero';
import { MagicCard } from '@/components/ui/magic-card';
import {
  Activity,
  AlertTriangle,
  Building2,
  CreditCard,
  Hourglass,
  LifeBuoy,
  PoundSterling,
  RotateCcw,
  Users,
  Webhook,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

function Kpi({
  label,
  value,
  href,
  prefix,
  icon: Icon,
  warn,
}: {
  label: string;
  value: number;
  href?: string;
  prefix?: string;
  icon: LucideIcon;
  warn?: boolean;
}) {
  return (
    <div className={KPI_SPAN_QUARTER}>
      <DashboardKpi label={label} value={value} href={href} prefix={prefix} icon={Icon} warn={warn} />
    </div>
  );
}

export default function AdminHqPage() {
  const { user } = useAuth();
  const [hq, setHq] = useState<AdminHqSnapshot | null>(null);
  const [health, setHealth] = useState<OpsHealth | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.admin.hq(), api.admin.opsHealth()])
      .then(([h, o]) => {
        setHq(h);
        setHealth(o);
      })
      .catch(() => toast.error('Failed to load HQ dashboard'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  const t = hq?.tenants;
  const b = hq?.billing;
  const ops = hq?.ops;

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8 space-y-6">
          <DashboardHero
            title="Platform HQ"
            subtitle="SaaS headquarters — tenants, billing, trials, and operations"
          />
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={load}>
              Refresh
            </Button>
          </div>

          {loading || !hq ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : (
            <>
              {health && (
                <Card className={health.status === 'healthy' ? '' : 'border-destructive/50'}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                      Ops status:{' '}
                      <span className="capitalize">{health.status}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-1">
                    {health.issues.length === 0 ? (
                      <p className="text-muted-foreground">No active platform alerts.</p>
                    ) : (
                      health.issues.map((i) => <p key={i}>{i}</p>)
                    )}
                  </CardContent>
                </Card>
              )}

              <DashboardSection title="Billing">
                <div className={KPI_GRID}>
                  <Kpi label="MRR" value={b?.mrr ?? 0} prefix="£" href="/admin/payments" icon={PoundSterling} />
                  <Kpi label="ARR" value={b?.arr ?? 0} prefix="£" icon={PoundSterling} />
                  <Kpi label="Net revenue" value={b?.net_revenue ?? 0} prefix="£" href="/admin/reports" icon={PoundSterling} />
                  <Kpi label="Outstanding" value={b?.outstanding ?? 0} prefix="£" href="/admin/invoices" icon={CreditCard} warn={(b?.outstanding ?? 0) > 0} />
                  <Kpi label="Refunds (all)" value={b?.refunds_total ?? 0} prefix="£" href="/admin/refunds" icon={RotateCcw} />
                  <Kpi label="Refunds pending" value={b?.refunds_pending ?? 0} href="/admin/refunds" icon={RotateCcw} warn={(b?.refunds_pending ?? 0) > 0} />
                  <Kpi label="Credit liability" value={b?.credit_liability ?? 0} prefix="£" icon={PoundSterling} />
                  <Kpi label="Churn 30d" value={b?.churn_rate_30d_pct ?? 0} icon={Activity} />
                  <Kpi label="Failed subs" value={b?.failed_subscriptions ?? 0} icon={AlertTriangle} warn={(b?.failed_subscriptions ?? 0) > 0} />
                  <Kpi label="Failed invoices" value={b?.failed_invoices ?? 0} href="/admin/invoices" icon={AlertTriangle} warn={(b?.failed_invoices ?? 0) > 0} />
                </div>
              </DashboardSection>

              <DashboardSection title="Tenants">
                <div className={KPI_GRID}>
                  <Kpi label="Total" value={t?.total ?? 0} href="/admin/companies" icon={Building2} />
                  <Kpi label="Active" value={t?.active ?? 0} href="/admin/companies" icon={Building2} />
                  <Kpi label="Trialing" value={t?.trialing ?? 0} href="/admin/trials" icon={Hourglass} />
                  <Kpi label="Trial expired" value={t?.trial_expired ?? 0} href="/admin/trials" icon={Hourglass} warn={(t?.trial_expired ?? 0) > 0} />
                  <Kpi label="Past due" value={t?.past_due ?? 0} icon={AlertTriangle} warn={(t?.past_due ?? 0) > 0} />
                  <Kpi label="Locked" value={t?.locked ?? 0} icon={AlertTriangle} warn={(t?.locked ?? 0) > 0} />
                  <Kpi label="New 7d" value={t?.new_7d ?? 0} icon={Building2} />
                  <Kpi label="Expiring 14d" value={t?.expiring_14d ?? 0} icon={Hourglass} />
                  <Kpi label="Active users" value={t?.active_users ?? 0} href="/admin/users" icon={Users} />
                </div>
              </DashboardSection>

              <DashboardSection title="Operations">
                <div className={KPI_GRID}>
                  <Kpi label="Open tickets" value={ops?.open_tickets ?? 0} href="/admin/tickets" icon={LifeBuoy} />
                  <Kpi label="SLA breaches" value={ops?.sla_breaches ?? 0} href="/admin/tickets" icon={AlertTriangle} warn={(ops?.sla_breaches ?? 0) > 0} />
                  <Kpi label="Critical errors" value={ops?.critical_errors ?? 0} href="/admin/errors" icon={AlertTriangle} warn={(ops?.critical_errors ?? 0) > 0} />
                  <Kpi label="Failed jobs" value={ops?.failed_jobs ?? 0} href="/admin/jobs" icon={Activity} warn={(ops?.failed_jobs ?? 0) > 0} />
                  <Kpi label="Queued jobs" value={ops?.queued_jobs ?? 0} href="/admin/jobs" icon={Activity} />
                  <Kpi label="Webhook failures" value={ops?.webhook_failure_count ?? 0} href="/admin/webhooks" icon={Webhook} warn={(ops?.webhook_failure_count ?? 0) > 0} />
                  <Kpi label="Notify failures" value={ops?.notification_failures ?? 0} href="/admin/templates" icon={AlertTriangle} />
                  <Kpi label="API calls 7d" value={ops?.api_calls_7d ?? 0} href="/admin/api-usage" icon={Activity} />
                </div>
              </DashboardSection>

              <div className="grid gap-4 lg:grid-cols-2">
                <MagicCard className="rounded-2xl" gradientSize={220} gradientFrom="#F45100" gradientTo="#FF6A1F" gradientColor="rgba(224,78,0,0.08)" gradientOpacity={0.55}>
                  <Card className="border-0 bg-transparent shadow-none">
                    <CardHeader>
                      <CardTitle className="text-base">Upcoming renewals (14d)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      {(hq.lists.upcoming_renewals || []).length === 0 ? (
                        <p className="text-muted-foreground">None</p>
                      ) : (
                        hq.lists.upcoming_renewals.map((r) => (
                          <div key={r.company_id} className="flex justify-between gap-2">
                            <Link href={`/admin/companies/${r.company_id}`} className="text-primary hover:underline">
                              {r.company_name}
                            </Link>
                            <span className="text-muted-foreground whitespace-nowrap">
                              {r.subscription_end ? new Date(r.subscription_end).toLocaleDateString() : '—'} · {r.tier}
                            </span>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </MagicCard>
                <MagicCard className="rounded-2xl" gradientSize={220} gradientFrom="#F45100" gradientTo="#FF6A1F" gradientColor="rgba(224,78,0,0.08)" gradientOpacity={0.55}>
                  <Card className="border-0 bg-transparent shadow-none">
                    <CardHeader>
                      <CardTitle className="text-base">Recent refunds</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      {(hq.lists.recent_refunds || []).length === 0 ? (
                        <p className="text-muted-foreground">None</p>
                      ) : (
                        hq.lists.recent_refunds.map((r) => (
                          <div key={r.id} className="flex justify-between gap-2">
                            <Link href="/admin/refunds" className="text-primary hover:underline">
                              #{r.id} · company {r.company_id}
                            </Link>
                            <span>
                              £{Number(r.amount).toFixed(2)} · {r.status}
                            </span>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </MagicCard>
              </div>
            </>
          )}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
