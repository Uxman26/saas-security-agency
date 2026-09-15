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

function Kpi({ label, value, href }: { label: string; value: string | number; href?: string }) {
  const inner = (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-semibold tabular-nums mt-1">{value}</p>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href} className="block hover:opacity-90">{inner}</Link> : inner;
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold">Platform HQ</h1>
              <p className="text-sm text-muted-foreground mt-1">
                SaaS headquarters — tenants, billing, trials, ops health
              </p>
            </div>
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

              <div>
                <h2 className="text-lg font-semibold mb-3">Billing</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Kpi label="MRR" value={`£${(b?.mrr ?? 0).toFixed(2)}`} href="/admin/payments" />
                  <Kpi label="ARR" value={`£${(b?.arr ?? 0).toFixed(2)}`} />
                  <Kpi label="Net revenue" value={`£${(b?.net_revenue ?? 0).toFixed(2)}`} href="/admin/reports" />
                  <Kpi label="Outstanding" value={`£${(b?.outstanding ?? 0).toFixed(2)}`} href="/admin/invoices" />
                  <Kpi label="Refunds (all)" value={`£${(b?.refunds_total ?? 0).toFixed(2)}`} href="/admin/refunds" />
                  <Kpi label="Refunds pending" value={b?.refunds_pending ?? 0} href="/admin/refunds" />
                  <Kpi label="Credit liability" value={`£${(b?.credit_liability ?? 0).toFixed(2)}`} />
                  <Kpi label="Churn 30d" value={`${b?.churn_rate_30d_pct ?? 0}%`} />
                  <Kpi label="Failed subs" value={b?.failed_subscriptions ?? 0} />
                  <Kpi label="Failed invoices" value={b?.failed_invoices ?? 0} href="/admin/invoices" />
                </div>
              </div>

              <div>
                <h2 className="text-lg font-semibold mb-3">Tenants</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Kpi label="Total" value={t?.total ?? 0} href="/admin/companies" />
                  <Kpi label="Active" value={t?.active ?? 0} href="/admin/companies" />
                  <Kpi label="Trialing" value={t?.trialing ?? 0} href="/admin/trials" />
                  <Kpi label="Trial expired" value={t?.trial_expired ?? 0} href="/admin/trials" />
                  <Kpi label="Past due" value={t?.past_due ?? 0} />
                  <Kpi label="Locked" value={t?.locked ?? 0} />
                  <Kpi label="New 7d" value={t?.new_7d ?? 0} />
                  <Kpi label="Expiring 14d" value={t?.expiring_14d ?? 0} />
                  <Kpi label="Active users" value={t?.active_users ?? 0} href="/admin/users" />
                </div>
              </div>

              <div>
                <h2 className="text-lg font-semibold mb-3">Operations</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Kpi label="Open tickets" value={ops?.open_tickets ?? 0} href="/admin/tickets" />
                  <Kpi label="SLA breaches" value={ops?.sla_breaches ?? 0} href="/admin/tickets" />
                  <Kpi label="Critical errors" value={ops?.critical_errors ?? 0} href="/admin/errors" />
                  <Kpi label="Failed jobs" value={ops?.failed_jobs ?? 0} href="/admin/jobs" />
                  <Kpi label="Queued jobs" value={ops?.queued_jobs ?? 0} href="/admin/jobs" />
                  <Kpi label="Webhook failures" value={ops?.webhook_failure_count ?? 0} href="/admin/webhooks" />
                  <Kpi label="Notify failures" value={ops?.notification_failures ?? 0} href="/admin/templates" />
                  <Kpi label="API calls 7d" value={ops?.api_calls_7d ?? 0} href="/admin/api-usage" />
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
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
                <Card>
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
              </div>
            </>
          )}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
