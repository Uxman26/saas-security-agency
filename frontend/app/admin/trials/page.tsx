'use client';
import { InlineTableSkeleton } from '@/components/skeletons';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import type { TrialConfig, TrialPeriod } from '@/lib/types';
import { toast } from '@/lib/toast';
import { usePlatformPermissions } from '@/hooks/use-platform-permissions';

const STATUSES = ['active', 'extended', 'expired', 'converted'] as const;
const DAY_OPTIONS = [7, 14, 30, 60];

export default function AdminTrialsPage() {
  const { user } = useAuth();
  const { can } = usePlatformPermissions();
  const [config, setConfig] = useState<TrialConfig | null>(null);
  const [trials, setTrials] = useState<TrialPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');
  const [savingConfig, setSavingConfig] = useState(false);
  const [expiring, setExpiring] = useState(false);

  const [extendTarget, setExtendTarget] = useState<TrialPeriod | null>(null);
  const [extensionDays, setExtensionDays] = useState('7');
  const [extendReason, setExtendReason] = useState('');
  const [extending, setExtending] = useState(false);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<TrialPeriod[]>([]);
  const [historyCompany, setHistoryCompany] = useState<string>('');

  const [startOpen, setStartOpen] = useState(false);
  const [startCompanyId, setStartCompanyId] = useState('');
  const [startDays, setStartDays] = useState('14');
  const [startNotes, setStartNotes] = useState('');
  const [startForce, setStartForce] = useState(false);
  const [starting, setStarting] = useState(false);

  const loadConfig = useCallback(() => {
    api.admin.trialsConfig().then(setConfig).catch(() => toast.error('Failed to load trial config'));
  }, []);

  const loadTrials = useCallback(() => {
    setLoading(true);
    api.admin
      .trials(status !== 'all' ? { status } : undefined)
      .then(setTrials)
      .catch(() => toast.error('Failed to load trials'))
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => {
    if (!user) return;
    loadConfig();
  }, [user, loadConfig]);

  useEffect(() => {
    if (!user) return;
    loadTrials();
  }, [user, loadTrials]);

  const saveConfig = async () => {
    if (!config) return;
    setSavingConfig(true);
    try {
      const updated = await api.admin.putTrialsConfig({
        default_days: config.default_days,
        allowed_days: config.allowed_days,
        allow_repeat: config.allow_repeat,
        require_card: config.require_card,
        reminder_days: config.reminder_days,
        eligible_tiers: config.eligible_tiers,
        enabled: config.enabled,
      });
      setConfig(updated);
      toast.success('Trial config saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingConfig(false);
    }
  };

  const expireDue = async () => {
    setExpiring(true);
    try {
      const res = await api.admin.expireDueTrials();
      toast.success(`Expired ${res.expired_trials} trial(s)`);
      loadTrials();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Expire failed');
    } finally {
      setExpiring(false);
    }
  };

  const submitExtend = async () => {
    if (!extendTarget) return;
    const days = parseInt(extensionDays, 10);
    if (!days || days < 1) {
      toast.error('Extension days required');
      return;
    }
    if (extendReason.trim().length < 3) {
      toast.error('Reason required');
      return;
    }
    setExtending(true);
    try {
      await api.admin.extendTrial(extendTarget.id, {
        extension_days: days,
        reason: extendReason.trim(),
      });
      toast.success('Trial extended');
      setExtendTarget(null);
      setExtendReason('');
      loadTrials();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Extend failed');
    } finally {
      setExtending(false);
    }
  };

  const viewHistory = async (t: TrialPeriod) => {
    try {
      const res = await api.admin.companyTrials(t.company_id);
      setHistoryRows(res.history);
      setHistoryCompany(t.company_name || `Company #${t.company_id}`);
      setHistoryOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load history');
    }
  };

  const submitStart = async () => {
    const companyId = parseInt(startCompanyId, 10);
    if (!companyId) {
      toast.error('Company ID required');
      return;
    }
    setStarting(true);
    try {
      await api.admin.startCompanyTrial(companyId, {
        duration_days: parseInt(startDays, 10) || undefined,
        notes: startNotes.trim() || undefined,
        force: startForce,
      });
      toast.success('Trial started');
      setStartOpen(false);
      setStartCompanyId('');
      setStartNotes('');
      setStartForce(false);
      loadTrials();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Start trial failed');
    } finally {
      setStarting(false);
    }
  };

  const reminderStr = config?.reminder_days?.join(', ') ?? '';

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8 space-y-6">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <h1 className="text-3xl font-bold">Trials</h1>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => { loadConfig(); loadTrials(); }}>
                Refresh
              </Button>
              {can('trials.write', 'billing.write') && (
                <Button size="sm" onClick={() => setStartOpen(true)}>
                  Start trial
                </Button>
              )}
              {can('trials.write', 'billing.write', 'ops.write') && (
                <Button variant="outline" size="sm" disabled={expiring} onClick={() => void expireDue()}>
                  {expiring ? 'Expiring…' : 'Expire due'}
                </Button>
              )}
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Trial configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!config ? (
                <p className="text-sm text-muted-foreground">Loading config…</p>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <Label htmlFor="default_days">Default days</Label>
                      <Input
                        id="default_days"
                        type="number"
                        min={1}
                        max={365}
                        className="mt-1"
                        value={config.default_days}
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10);
                          if (!Number.isNaN(n)) setConfig({ ...config, default_days: n });
                        }}
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">1–365. Quick set:</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {DAY_OPTIONS.map((d) => (
                          <Button
                            key={d}
                            type="button"
                            size="sm"
                            variant={config.default_days === d ? 'default' : 'outline'}
                            onClick={() => setConfig({ ...config, default_days: d })}
                          >
                            {d}d
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="reminder_days">Reminder days</Label>
                      <Input
                        id="reminder_days"
                        className="mt-1"
                        value={reminderStr}
                        onChange={(e) => {
                          const parts = e.target.value
                            .split(',')
                            .map((x) => parseInt(x.trim(), 10))
                            .filter((n) => !Number.isNaN(n) && n > 0);
                          setConfig({ ...config, reminder_days: parts });
                        }}
                        placeholder="7, 3, 1"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm pt-6">
                      <input
                        type="checkbox"
                        checked={config.require_card}
                        onChange={(e) => setConfig({ ...config, require_card: e.target.checked })}
                      />
                      Require card verification
                    </label>
                    <label className="flex items-center gap-2 text-sm pt-6">
                      <input
                        type="checkbox"
                        checked={config.allow_repeat}
                        onChange={(e) => setConfig({ ...config, allow_repeat: e.target.checked })}
                      />
                      Allow repeat trials
                    </label>
                    <label className="flex items-center gap-2 text-sm pt-6">
                      <input
                        type="checkbox"
                        checked={config.enabled}
                        onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                      />
                      Trials enabled
                    </label>
                  </div>
                  <Button onClick={() => void saveConfig()} disabled={savingConfig || !can('trials.write', 'billing.write', 'config.write')}>
                    {savingConfig ? 'Saving…' : 'Save config'}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
              <CardTitle>Trials</CardTitle>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-40 capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              {loading ? (
                <InlineTableSkeleton />
              ) : trials.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No trials.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableCell>ID</TableCell>
                      <TableCell>Company</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Plan</TableCell>
                      <TableCell>Started</TableCell>
                      <TableCell>Days left</TableCell>
                      <TableCell>Ends</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trials.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>{t.id}</TableCell>
                        <TableCell>
                          <Link
                            href={`/admin/companies/${t.company_id}`}
                            className="text-primary hover:underline"
                          >
                            {t.company_name || `#${t.company_id}`}
                          </Link>
                        </TableCell>
                        <TableCell className="capitalize">{t.status}</TableCell>
                        <TableCell className="capitalize">{t.plan_tier || '—'}</TableCell>
                        <TableCell>
                          {t.started_at ? new Date(t.started_at).toLocaleDateString() : '—'}
                        </TableCell>
                        <TableCell>
                          {t.status === 'active' || t.status === 'extended'
                            ? t.days_remaining ?? '—'
                            : '—'}
                        </TableCell>
                        <TableCell>
                          {t.ends_at ? new Date(t.ends_at).toLocaleDateString() : '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            {(t.status === 'active' || t.status === 'extended') && can('trials.write', 'billing.write') && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setExtendTarget(t);
                                  setExtensionDays('7');
                                  setExtendReason('');
                                }}
                              >
                                Extend
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => void viewHistory(t)}>
                              History
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <Dialog open={!!extendTarget} onOpenChange={(o) => !o && setExtendTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Extend trial #{extendTarget?.id}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="ext_days">Extension days</Label>
                <Input
                  id="ext_days"
                  type="number"
                  min={1}
                  max={365}
                  className="mt-1"
                  value={extensionDays}
                  onChange={(e) => setExtensionDays(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="ext_reason">Reason</Label>
                <Input
                  id="ext_reason"
                  className="mt-1"
                  value={extendReason}
                  onChange={(e) => setExtendReason(e.target.value)}
                />
              </div>
              <Button onClick={() => void submitExtend()} disabled={extending}>
                {extending ? 'Extending…' : 'Extend'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Trial history — {historyCompany}</DialogTitle>
            </DialogHeader>
            {historyRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No history.</p>
            ) : (
              <ul className="space-y-3 text-sm max-h-80 overflow-y-auto">
                {historyRows.map((h) => (
                  <li key={h.id} className="border-b pb-2 last:border-0">
                    <p className="font-medium capitalize">
                      #{h.id} · {h.status} · {h.duration_days}d
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Original {h.duration_days}d · {h.started_at ? new Date(h.started_at).toLocaleString() : '—'} →{' '}
                      {h.ends_at ? new Date(h.ends_at).toLocaleString() : '—'}
                    </p>
                    {(h.extensions || []).map((e) => (
                      <p key={e.id} className="text-xs mt-1">
                        +{e.extension_days}d on {new Date(e.created_at).toLocaleString()} by{' '}
                        {e.extended_by_name || e.extended_by_email || `user #${e.extended_by_user_id}`}
                        {e.reason ? ` — ${e.reason}` : ''}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={startOpen} onOpenChange={setStartOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Start company trial</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="start_co">Company ID</Label>
                <Input
                  id="start_co"
                  type="number"
                  className="mt-1"
                  value={startCompanyId}
                  onChange={(e) => setStartCompanyId(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="start_days">Duration (days)</Label>
                <Input
                  id="start_days"
                  type="number"
                  min={1}
                  max={365}
                  className="mt-1"
                  value={startDays}
                  onChange={(e) => setStartDays(e.target.value)}
                />
                <div className="flex flex-wrap gap-1 mt-1">
                  {DAY_OPTIONS.map((d) => (
                    <Button
                      key={d}
                      type="button"
                      size="sm"
                      variant={startDays === String(d) ? 'default' : 'outline'}
                      onClick={() => setStartDays(String(d))}
                    >
                      {d}d
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <Label htmlFor="start_notes">Notes</Label>
                <Input
                  id="start_notes"
                  className="mt-1"
                  value={startNotes}
                  onChange={(e) => setStartNotes(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={startForce}
                  onChange={(e) => setStartForce(e.target.checked)}
                />
                Force (override eligibility; notes required)
              </label>
              <Button onClick={() => void submitStart()} disabled={starting}>
                {starting ? 'Starting…' : 'Start trial'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </AppShell>
    </ProtectedRoute>
  );
}
