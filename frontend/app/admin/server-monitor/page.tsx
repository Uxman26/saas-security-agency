'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import type { ServerMonitorReport, ServerMonitorTenantRow } from '@/lib/types';
import { toast } from '@/lib/toast';
import { storageGet } from '@/lib/safe-storage';

function MetricCard({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <Card className={warn ? 'border-amber-500/50' : undefined}>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {hint ? (
        <CardContent>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </CardContent>
      ) : null}
    </Card>
  );
}

function pct(v: unknown): string {
  if (v == null || Number.isNaN(Number(v))) return '—';
  return `${Number(v).toFixed(1)}%`;
}

function num(v: unknown, digits = 0): string {
  if (v == null || Number.isNaN(Number(v))) return '—';
  return Number(v).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

export default function AdminServerMonitorPage() {
  const { user } = useAuth();
  const [hours, setHours] = useState('24');
  const [companyId, setCompanyId] = useState('');
  const [tier, setTier] = useState('all');
  const [q, setQ] = useState('');
  const [data, setData] = useState<ServerMonitorReport | null>(null);
  const [selected, setSelected] = useState<ServerMonitorTenantRow | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.admin
      .serverMonitorReport({
        hours: parseInt(hours, 10),
        company_id: companyId ? parseInt(companyId, 10) : undefined,
        tier: tier === 'all' ? undefined : tier,
      })
      .then((report) => {
        setData(report);
        setSelected(null);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Failed to load server monitor'))
      .finally(() => setLoading(false));
  }, [hours, companyId, tier]);

  useEffect(() => {
    if (!user) return;
    load();
    const id = window.setInterval(load, 60_000);
    return () => window.clearInterval(id);
  }, [user, load]);

  const tenants = useMemo(() => {
    const rows = data?.tenants?.tenants || [];
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (t) =>
        String(t.company_id).includes(needle) ||
        (t.company_name || '').toLowerCase().includes(needle) ||
        (t.subscription_tier || '').toLowerCase().includes(needle),
    );
  }, [data, q]);

  const host = data?.host || {};
  const cpu = host.cpu || {};
  const mem = host.memory || {};
  const disk = host.disk || {};
  const net = host.network || {};
  const loadAvg = host.load || {};
  const apiStats = data?.api || {};
  const jobs = data?.jobs || {};
  const history = (data?.history || []).map((p) => ({
    ...p,
    label: p.captured_at ? p.captured_at.slice(11, 16) : '',
  }));

  const exportCsv = async () => {
    try {
      const path = api.admin.serverMonitorExportCsvUrl({
        hours: parseInt(hours, 10),
        company_id: companyId ? parseInt(companyId, 10) : undefined,
        tier: tier === 'all' ? undefined : tier,
      });
      const base = process.env.NEXT_PUBLIC_API_URL || '';
      const token = typeof window !== 'undefined' ? storageGet('token')?.trim() : null;
      const res = await fetch(`${base}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'server-monitor-tenants.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    }
  };

  const takeSnapshot = async () => {
    try {
      await api.admin.serverMonitorSnapshot();
      toast.success('Snapshot stored');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Snapshot failed');
    }
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto space-y-6 px-4 py-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Server usage & load</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Live host metrics where measurable, plus tenant-aware API and job usage. No fabricated
                values — unavailable metrics are labelled explicitly.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={hours} onValueChange={setHours}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Last 1 hour</SelectItem>
                  <SelectItem value="24">Last 24 hours</SelectItem>
                  <SelectItem value="168">Last 7 days</SelectItem>
                  <SelectItem value="720">Last 30 days</SelectItem>
                </SelectContent>
              </Select>
              <Select value={tier} onValueChange={setTier}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All plans</SelectItem>
                  <SelectItem value="basic">Basic</SelectItem>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="premium">Premium</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
              <Input
                className="w-32"
                placeholder="Tenant ID"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value.replace(/\D/g, ''))}
              />
              <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={takeSnapshot}>
                Snapshot now
              </Button>
              <Button variant="outline" size="sm" onClick={exportCsv}>
                Export CSV
              </Button>
            </div>
          </div>

          {data?.data_quality ? (
            <Card>
              <CardContent className="flex flex-wrap gap-2 pt-4 text-xs text-muted-foreground">
                <Badge variant="secondary">Host: {String(data.data_quality.host_metrics)}</Badge>
                <Badge variant="secondary">API: {String(data.data_quality.api_metrics)}</Badge>
                <Badge variant="outline">Tenant CPU/RAM: {String(data.data_quality.tenant_cpu_ram)}</Badge>
                <Badge variant="outline">Tenant storage: {String(data.data_quality.tenant_storage)}</Badge>
                <span>Generated {data.generated_at}</span>
              </CardContent>
            </Card>
          ) : null}

          {loading && !data ? (
            <p className="text-muted-foreground">Loading measured metrics…</p>
          ) : data ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  label="CPU"
                  value={host.source === 'unavailable' ? 'Unavailable' : pct(cpu.percent)}
                  hint={
                    host.source === 'unavailable'
                      ? String(host.instrumentation_required || host.reason || '')
                      : `${cpu.count || '—'} cores · live`
                  }
                  warn={Number(cpu.percent) >= (data.thresholds?.cpu_percent_warn || 80)}
                />
                <MetricCard
                  label="RAM"
                  value={host.source === 'unavailable' ? 'Unavailable' : pct(mem.percent)}
                  hint={
                    host.source === 'unavailable'
                      ? 'Install psutil on API host'
                      : `${num(mem.used_mb, 0)} / ${num(mem.total_mb, 0)} MB`
                  }
                  warn={Number(mem.percent) >= (data.thresholds?.ram_percent_warn || 85)}
                />
                <MetricCard
                  label="Disk"
                  value={host.source === 'unavailable' ? 'Unavailable' : pct(disk.percent)}
                  hint={
                    host.source === 'unavailable'
                      ? 'Host disk sample unavailable'
                      : `${num(disk.used_gb, 1)} / ${num(disk.total_gb, 1)} GB · uploads ${num(disk.uploads_mb, 1)} MB`
                  }
                  warn={Number(disk.percent) >= (data.thresholds?.disk_percent_warn || 85)}
                />
                <MetricCard
                  label="API requests"
                  value={num(apiStats.total_requests)}
                  hint={`~${num(apiStats.requests_per_second, 3)} rps · errors ${pct(apiStats.error_rate_percent)}`}
                  warn={Number(apiStats.error_rate_percent) >= (data.thresholds?.api_error_rate_warn || 5)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  label="API latency"
                  value={
                    apiStats.avg_duration_ms == null
                      ? 'No timed samples yet'
                      : `${num(apiStats.avg_duration_ms, 0)} ms avg`
                  }
                  hint={`p95 ${apiStats.p95_duration_ms ?? '—'} ms · max ${apiStats.max_duration_ms ?? '—'} ms`}
                />
                <MetricCard
                  label="Database"
                  value={data.database?.ok ? `${num(data.database.ping_ms)} ms ping` : 'Unreachable'}
                  hint={
                    data.database?.slow_queries?.measurement === 'unavailable'
                      ? 'Slow-query stats require DB instrumentation'
                      : 'OK'
                  }
                />
                <MetricCard
                  label="Background jobs"
                  value={`${num(jobs.total)} in window`}
                  hint={`Fail rate ${pct(jobs.fail_rate_percent)} · running ${num(jobs.running_now)}`}
                  warn={Number(jobs.fail_rate_percent) >= (data.thresholds?.job_fail_rate_warn || 10)}
                />
                <MetricCard
                  label="Load / network"
                  value={
                    loadAvg.load_1 == null
                      ? host.source === 'unavailable'
                        ? 'Unavailable'
                        : '—'
                      : String(loadAvg.load_1)
                  }
                  hint={
                    net.bytes_recv == null
                      ? 'Network counters unavailable'
                      : `↓ ${num(Math.round(Number(net.bytes_recv) / 1048576))} MB · ↑ ${num(Math.round(Number(net.bytes_sent) / 1048576))} MB since boot · err ${num(net.errin)}/${num(net.errout)}`
                  }
                />
              </div>

              {(data.alerts || []).length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Active alerts</CardTitle>
                    <CardDescription>Threshold-based; measured from live host + logs</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {data.alerts.map((a) => (
                      <div
                        key={`${a.code}-${a.timestamp}`}
                        className="rounded-lg border px-3 py-2 text-sm"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={
                              a.severity === 'critical'
                                ? 'destructive'
                                : a.severity === 'warning'
                                  ? 'default'
                                  : 'secondary'
                            }
                          >
                            {a.severity}
                          </Badge>
                          <span className="font-medium">{a.title}</span>
                          <span className="text-xs text-muted-foreground">{a.timestamp}</span>
                        </div>
                        <p className="mt-1 text-muted-foreground">{a.detail}</p>
                        <p className="mt-1 text-xs">Action: {a.recommended_action}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : null}

              <Card>
                <CardHeader>
                  <CardTitle>Historical utilisation</CardTitle>
                  <CardDescription>
                    From worker snapshots every 5 minutes (empty until snapshots exist)
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-72">
                  {history.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No snapshot history yet. Click “Snapshot now” or wait for the cron worker.
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={history}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                        <Tooltip />
                        <Area
                          type="monotone"
                          dataKey="cpu_percent"
                          name="CPU %"
                          stroke="hsl(var(--foreground))"
                          fill="hsl(var(--foreground) / 0.12)"
                        />
                        <Area
                          type="monotone"
                          dataKey="ram_percent"
                          name="RAM %"
                          stroke="hsl(var(--primary))"
                          fill="hsl(var(--primary) / 0.12)"
                        />
                        <Area
                          type="monotone"
                          dataKey="disk_percent"
                          name="Disk %"
                          stroke="hsl(var(--muted-foreground))"
                          fill="hsl(var(--muted-foreground) / 0.08)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Top API paths</CardTitle>
                  </CardHeader>
                  <CardContent className="max-h-80 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Path</TableHead>
                          <TableHead className="text-right">Count</TableHead>
                          <TableHead className="text-right">Avg ms</TableHead>
                          <TableHead className="text-right">Failed</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(apiStats.top_paths || []).map((p: any) => (
                          <TableRow key={p.path}>
                            <TableCell className="max-w-[220px] truncate font-mono text-xs">
                              {p.path}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{p.count}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {p.avg_duration_ms ?? '—'}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{p.failed}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Cron / job activity</CardTitle>
                  </CardHeader>
                  <CardContent className="max-h-80 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Job</TableHead>
                          <TableHead className="text-right">Runs</TableHead>
                          <TableHead className="text-right">Avg s</TableHead>
                          <TableHead className="text-right">Fails</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(jobs.by_job || []).map((j: any) => (
                          <TableRow key={j.job_name}>
                            <TableCell className="font-mono text-xs">{j.job_name}</TableCell>
                            <TableCell className="text-right tabular-nums">{j.count}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {j.avg_duration_sec ?? '—'}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{j.failures}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {jobs.resource_consumption?.note ? (
                      <p className="mt-3 text-xs text-muted-foreground">
                        {jobs.resource_consumption.note}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle>Tenant usage</CardTitle>
                    <CardDescription>
                      Measured API/session/job counts. CPU/RAM per tenant is not attributed on shared
                      hosts.
                    </CardDescription>
                  </div>
                  <Input
                    className="w-56"
                    placeholder="Search tenants"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </CardHeader>
                <CardContent className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tenant</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead className="text-right">API</TableHead>
                        <TableHead className="text-right">Failed</TableHead>
                        <TableHead className="text-right">Avg ms</TableHead>
                        <TableHead className="text-right">Users</TableHead>
                        <TableHead className="text-right">Sessions</TableHead>
                        <TableHead className="text-right">Logo MB</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tenants.map((t) => (
                        <TableRow
                          key={t.company_id}
                          className="cursor-pointer"
                          onClick={() => setSelected(t)}
                        >
                          <TableCell>
                            <div className="font-medium">{t.company_name || '—'}</div>
                            <div className="text-xs text-muted-foreground">#{t.company_id}</div>
                          </TableCell>
                          <TableCell>
                            <div>{t.subscription_tier || '—'}</div>
                            <div className="text-xs text-muted-foreground">
                              {t.subscription_status || '—'}
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{t.api_requests}</TableCell>
                          <TableCell className="text-right tabular-nums">{t.api_failed}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {t.api_avg_duration_ms ?? '—'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{t.active_users}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {t.concurrent_sessions}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {t.logo_storage_mb}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {(data.tenants?.measurement_notes || []).map((n) => (
                    <p key={n} className="mt-2 text-xs text-muted-foreground">
                      {n}
                    </p>
                  ))}
                </CardContent>
              </Card>

              {selected ? (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      Tenant detail — {selected.company_name} (#{selected.company_id})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">API / min</p>
                      <p className="tabular-nums font-medium">{selected.api_requests_per_minute}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Peak latency</p>
                      <p className="tabular-nums font-medium">
                        {selected.api_peak_duration_ms ?? '—'} ms
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Background jobs</p>
                      <p className="tabular-nums font-medium">{selected.background_jobs}</p>
                    </div>
                    <div className="sm:col-span-2 lg:col-span-3 rounded-md border p-3 text-xs text-muted-foreground">
                      <p>{selected.cpu_ram_attribution?.note}</p>
                      <p className="mt-1">{selected.storage_attribution?.note}</p>
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              {host.top_processes?.length ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Top host processes</CardTitle>
                    <CardDescription>Live sample via psutil (host-wide, not per tenant)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>PID</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead className="text-right">CPU %</TableHead>
                          <TableHead className="text-right">RSS MB</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {host.top_processes.map((p: any) => (
                          <TableRow key={p.pid}>
                            <TableCell className="tabular-nums">{p.pid}</TableCell>
                            <TableCell>{p.name}</TableCell>
                            <TableCell className="text-right tabular-nums">{p.cpu_percent}</TableCell>
                            <TableCell className="text-right tabular-nums">{p.rss_mb}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ) : null}
            </>
          ) : null}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
