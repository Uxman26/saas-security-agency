'use client';

import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLeadDashboard } from '@/hooks/use-leads';
import { ArrowLeft, Target, TrendingUp, Users } from 'lucide-react';

function statusLabel(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function LeadsDashboardPage() {
  const { data, isLoading } = useLeadDashboard();

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8 space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/leads">
                <ArrowLeft className="size-4 mr-1" />
                Leads
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">Lead dashboard</h1>
          </div>

          {isLoading || !data ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total leads</CardTitle>
                  </CardHeader>
                  <CardContent className="text-3xl font-bold tabular-nums">{data.total_leads}</CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Conversion rate</CardTitle>
                  </CardHeader>
                  <CardContent className="text-3xl font-bold tabular-nums">{data.conversion_rate}%</CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Revenue forecast</CardTitle>
                  </CardHeader>
                  <CardContent className="text-3xl font-bold tabular-nums">£{data.revenue_forecast.toLocaleString()}</CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Missed follow-ups</CardTitle>
                  </CardHeader>
                  <CardContent className="text-3xl font-bold tabular-nums text-amber-600">{data.missed_follow_ups}</CardContent>
                </Card>
              </div>

              <div className="grid lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Target className="size-4" />
                      Sales pipeline (funnel)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {data.funnel.map((f) => (
                      <div key={f.status} className="flex items-center gap-3">
                        <span className="w-32 text-sm truncate">{statusLabel(f.status)}</span>
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${Math.min(100, (f.count / Math.max(data.period_leads, 1)) * 100)}%` }}
                          />
                        </div>
                        <span className="text-sm tabular-nums w-8 text-right">{f.count}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="size-4" />
                      Lead sources
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {data.sources.map((s) => (
                      <div key={s.source} className="flex justify-between text-sm">
                        <span>{statusLabel(s.source)}</span>
                        <span className="tabular-nums font-medium">{s.count}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingUp className="size-4" />
                      Lead trend ({data.period_start} – {data.period_end})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-end gap-1 h-32">
                      {data.trend.map((t) => {
                        const max = Math.max(...data.trend.map((x) => x.count), 1);
                        return (
                          <div key={t.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                            <div className="w-full bg-primary/80 rounded-t" style={{ height: `${(t.count / max) * 100}%`, minHeight: t.count ? 4 : 0 }} />
                            <span className="text-[10px] text-muted-foreground truncate w-full text-center">{t.date.slice(5)}</span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-sm text-muted-foreground mt-4">Monthly growth: {data.monthly_growth}%</p>
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
