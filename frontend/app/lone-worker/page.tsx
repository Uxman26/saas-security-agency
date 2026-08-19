'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { ModuleHeader, ModulePage, ModuleTabs } from '@/components/module-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { LoneWorkerEvent, LoneWorkerIncident, LoneWorkerPolicy, LoneWorkerSession, Site } from '@/lib/types';
import { toast } from '@/lib/toast';
import { ShieldAlert, Plus, Phone } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { canModule } from '@/lib/permissions';

/** The board refreshes on a timer because a missed check is created by the backend
 *  sweep, not by anything the operator did in this tab. */
const REFRESH_MS = 20000;

const STATUS_TONE: Record<string, string> = {
  SAFE: 'bg-emerald-100 text-emerald-800',
  'SESSION ACTIVE': 'bg-emerald-100 text-emerald-800',
  'CHECK DUE': 'bg-amber-100 text-amber-900',
  'GRACE PERIOD': 'bg-orange-100 text-orange-900',
  'MISSED CHECK': 'bg-red-100 text-red-800',
  ESCALATING: 'bg-red-100 text-red-800',
  EMERGENCY: 'bg-red-600 text-white',
  'ASSISTANCE REQUESTED': 'bg-orange-100 text-orange-900',
  'RESPONDER INVESTIGATING': 'bg-blue-100 text-blue-800',
  'SESSION COMPLETED': 'bg-slate-100 text-slate-700',
};

function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] || 'bg-slate-100 text-slate-700';
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${tone}`}>{status}</span>;
}

function countdown(seconds?: number | null): string {
  if (seconds === null || seconds === undefined) return '—';
  const overdue = seconds < 0;
  const s = Math.abs(seconds);
  const label = `${Math.floor(s / 3600) > 0 ? `${Math.floor(s / 3600)}h ` : ''}${Math.floor((s % 3600) / 60)}m`;
  return overdue ? `${label} overdue` : `in ${label}`;
}

function timeOf(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export default function LoneWorkerPage() {
  // The API is the real boundary; these stop the UI offering actions it
  // already knows the role will be refused.
  const { user: permUser } = useAuth();
  const canRespond = canModule(permUser, 'lone_worker', 'respond');
  const canResolve = canModule(permUser, 'lone_worker', 'resolve');
  const canManagePolicy = canModule(permUser, 'lone_worker', 'policy_manage');
  const canAudit = canModule(permUser, 'lone_worker', 'audit_view');

  const [tab, setTab] = useState<'board' | 'rules' | 'audit'>('board');
  const [sessions, setSessions] = useState<LoneWorkerSession[]>([]);
  const [incidents, setIncidents] = useState<LoneWorkerIncident[]>([]);
  const [policies, setPolicies] = useState<LoneWorkerPolicy[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [events, setEvents] = useState<LoneWorkerEvent[]>([]);

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(weekAgo);
  const [endDate, setEndDate] = useState(today);
  const [auditSite, setAuditSite] = useState('');

  const [policyOpen, setPolicyOpen] = useState(false);
  const [policyForm, setPolicyForm] = useState({
    name: '',
    site_id: '',
    check_in_minutes: '60',
    reminder_minutes: '5',
    grace_minutes: '5',
    escalation_interval_minutes: '5',
    l1_name: '', l1_email: '', l1_phone: '',
    l2_name: '', l2_email: '', l2_phone: '',
    l3_name: '', l3_email: '', l3_phone: '',
  });

  const loadBoard = useCallback(async () => {
    try {
      const [s, i] = await Promise.all([
        api.loneWorker.sessions({ status_filter: 'active' }),
        api.loneWorker.incidents({ status_filter: 'open' }),
      ]);
      setSessions(s);
      setIncidents(i);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load lone workers');
    }
  }, []);

  const loadRules = useCallback(async () => {
    try {
      setPolicies(await api.loneWorker.listPolicies());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load check call rules');
    }
  }, []);

  const loadAudit = useCallback(async () => {
    try {
      setEvents(await api.loneWorker.events({
        start_date: startDate,
        end_date: endDate,
        site_id: auditSite || undefined,
        limit: 1000,
      }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load audit log');
    }
  }, [startDate, endDate, auditSite]);

  useEffect(() => { void loadBoard(); }, [loadBoard]);
  // Sites feed both the audit filter and the policy dialog, so they load once up front.
  useEffect(() => { void api.sites.list().then(setSites).catch(() => setSites([])); }, []);
  useEffect(() => { if (tab === 'rules') void loadRules(); }, [tab, loadRules]);
  useEffect(() => { if (tab === 'audit') void loadAudit(); }, [tab, loadAudit]);

  useEffect(() => {
    if (tab !== 'board') return;
    const t = setInterval(() => { void loadBoard(); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [tab, loadBoard]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      await loadBoard();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    }
  };

  const savePolicy = async () => {
    const contacts = [1, 2, 3]
      .map((lvl) => {
        const f = policyForm as unknown as Record<string, string>;
        return { level: lvl, name: f[`l${lvl}_name`], email: f[`l${lvl}_email`], phone: f[`l${lvl}_phone`] };
      })
      .filter((c) => c.name || c.email || c.phone);
    try {
      await api.loneWorker.createPolicy({
        name: policyForm.name,
        site_id: policyForm.site_id ? Number(policyForm.site_id) : null,
        check_in_minutes: Number(policyForm.check_in_minutes),
        reminder_minutes: Number(policyForm.reminder_minutes),
        grace_minutes: Number(policyForm.grace_minutes),
        escalation_interval_minutes: Number(policyForm.escalation_interval_minutes),
        contacts,
      });
      toast.success('Check call rule saved');
      setPolicyOpen(false);
      await loadRules();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save rule');
    }
  };

  const atRisk = useMemo(
    () => sessions.filter((s) => ['CHECK DUE', 'GRACE PERIOD', 'MISSED CHECK', 'ESCALATING', 'EMERGENCY', 'ASSISTANCE REQUESTED'].includes(s.display_status)),
    [sessions],
  );

  return (
    <ProtectedRoute>
      <AppShell>
        <ModulePage>
          <ModuleHeader
            title={<span className="flex items-center gap-2"><ShieldAlert className="h-6 w-6" /> Lone worker</span>}
            description="Live check calls, missed check escalation and the full audit trail."
            actions={
              tab === 'rules' && canManagePolicy ? (
                <Button onClick={() => setPolicyOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" /> New check call rule
                </Button>
              ) : undefined
            }
          />

          <ModuleTabs
            tabs={[
              { id: 'board' as const, label: `Live board${atRisk.length ? ` (${atRisk.length})` : ''}` },
              { id: 'rules' as const, label: 'Check call rules' },
              ...(canAudit ? [{ id: 'audit' as const, label: 'Audit log' }] : []),
            ]}
            value={tab}
            onChange={(k) => setTab(k)}
          />

          {tab === 'board' && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Open incidents</CardTitle>
                </CardHeader>
                <CardContent>
                  {incidents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No open lone worker incidents.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Status</TableHead>
                          <TableHead>Worker</TableHead>
                          <TableHead>Site</TableHead>
                          <TableHead>Opened</TableHead>
                          <TableHead>Level</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {incidents.map((i) => (
                          <TableRow key={i.id}>
                            <TableCell><StatusBadge status={i.display_status} /></TableCell>
                            <TableCell>
                              <div className="font-medium">{i.guard_name || '—'}</div>
                              {i.guard_phone && (
                                <a className="text-xs text-blue-700 hover:underline" href={`tel:${i.guard_phone}`}>
                                  <Phone className="mr-1 inline h-3 w-3" />{i.guard_phone}
                                </a>
                              )}
                            </TableCell>
                            <TableCell>
                              {i.site_name || '—'}
                              {i.latitude != null && i.longitude != null && (
                                <a
                                  className="ml-2 text-xs text-blue-700 hover:underline"
                                  href={`https://www.google.com/maps?q=${i.latitude},${i.longitude}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  map
                                </a>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">{timeOf(i.opened_at)}</TableCell>
                            <TableCell className="text-sm">{i.escalation_level}</TableCell>
                            <TableCell className="space-x-2">
                              {canRespond && i.status === 'escalating' && (
                                <Button size="sm" variant="outline" onClick={() => act(() => api.loneWorker.acknowledge(i.id), 'Acknowledged')}>
                                  Acknowledge
                                </Button>
                              )}
                              {canRespond && (
                                <Button size="sm" variant="outline" onClick={() => act(() => api.loneWorker.contactAttempt(i.id, 'call', 'called worker'), 'Call attempt logged')}>
                                  Log call
                                </Button>
                              )}
                              {canRespond && (
                                <Button size="sm" variant="outline" onClick={() => act(() => api.loneWorker.escalate(i.id), 'Escalated')}>
                                  Escalate
                                </Button>
                              )}
                              {canResolve && (
                                <Button size="sm" onClick={() => act(() => api.loneWorker.resolve(i.id, 'safe'), 'Marked safe')}>
                                  Mark safe
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Active lone workers ({sessions.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  {sessions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nobody is lone working right now.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Status</TableHead>
                          <TableHead>Worker</TableHead>
                          <TableHead>Site / location</TableHead>
                          <TableHead>Started</TableHead>
                          <TableHead>Last check-in</TableHead>
                          <TableHead>Next check</TableHead>
                          <TableHead>From</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sessions.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell><StatusBadge status={s.display_status} /></TableCell>
                            <TableCell className="font-medium">{s.guard_name || '—'}</TableCell>
                            <TableCell>
                              {s.site_name || '—'}
                              {s.location_note && <div className="text-xs text-muted-foreground">{s.location_note}</div>}
                            </TableCell>
                            <TableCell className="text-sm">{timeOf(s.started_at)}</TableCell>
                            <TableCell className="text-sm">{timeOf(s.last_check_in_at)}</TableCell>
                            <TableCell className="text-sm">{countdown(s.seconds_to_next_check)}</TableCell>
                            <TableCell className="text-sm capitalize">{s.source || '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {tab === 'rules' && (
            <Card>
              <CardHeader>
                <CardTitle>Check call rules</CardTitle>
              </CardHeader>
              <CardContent>
                {policies.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No rules yet. A rule sets the check-in frequency, the reminder and grace periods, and who is
                    notified at each escalation level. A rule with no site is the company-wide default.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Site</TableHead>
                        <TableHead>Check-in</TableHead>
                        <TableHead>Reminder</TableHead>
                        <TableHead>Grace</TableHead>
                        <TableHead>Escalation ladder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {policies.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell>{p.site_name || 'All sites (default)'}</TableCell>
                          <TableCell>Every {p.check_in_minutes} min</TableCell>
                          <TableCell>{p.reminder_minutes} min before</TableCell>
                          <TableCell>{p.grace_minutes} min</TableCell>
                          <TableCell className="text-sm">
                            {p.contacts.length === 0
                              ? <span className="text-red-700">No contacts — nobody will be alerted</span>
                              : p.contacts.map((c) => `${c.level}. ${c.name || c.email || c.phone}`).join(' → ')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}

          {tab === 'audit' && (
            <Card>
              <CardHeader>
                <CardTitle>Audit log</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <Label htmlFor="lw-from">From</Label>
                    <Input id="lw-from" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="lw-to">To</Label>
                    <Input id="lw-to" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </div>
                  <div className="min-w-[200px]">
                    <Label>Site</Label>
                    <Select value={auditSite || 'all'} onValueChange={(v) => setAuditSite(v === 'all' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="All sites" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All sites</SelectItem>
                        {sites.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="outline" onClick={() => void loadAudit()}>Refresh</Button>
                </div>

                {events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No lone worker activity in this period.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Time</TableHead>
                          <TableHead>Event</TableHead>
                          <TableHead>Worker</TableHead>
                          <TableHead>Site</TableHead>
                          <TableHead>Detail</TableHead>
                          <TableHead>Level</TableHead>
                          <TableHead>Sent to</TableHead>
                          <TableHead>By</TableHead>
                          <TableHead>Source</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {events.map((e) => (
                          <TableRow key={e.id}>
                            <TableCell className="whitespace-nowrap text-sm">{e.event_date}</TableCell>
                            <TableCell className="whitespace-nowrap text-sm">{e.event_time}</TableCell>
                            <TableCell className="whitespace-nowrap font-medium">{e.event_label}</TableCell>
                            <TableCell>{e.guard || '—'}</TableCell>
                            <TableCell>{e.site || '—'}</TableCell>
                            <TableCell className="max-w-[320px] text-sm">{e.message}</TableCell>
                            <TableCell className="text-sm">{e.escalation_level ?? '—'}</TableCell>
                            <TableCell className="text-sm">
                              {e.channel ? `${e.channel}: ${e.recipient || ''}` : '—'}
                            </TableCell>
                            <TableCell className="text-sm">{e.user}</TableCell>
                            <TableCell className="text-sm capitalize">{e.source}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Dialog open={policyOpen} onOpenChange={setPolicyOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>New check call rule</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="p-name">Name</Label>
                    <Input id="p-name" value={policyForm.name} onChange={(e) => setPolicyForm({ ...policyForm, name: e.target.value })} placeholder="Night lone working" />
                  </div>
                  <div>
                    <Label>Site</Label>
                    <Select value={policyForm.site_id || 'all'} onValueChange={(v) => setPolicyForm({ ...policyForm, site_id: v === 'all' ? '' : v })}>
                      <SelectTrigger><SelectValue placeholder="All sites (default)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All sites (default)</SelectItem>
                        {sites.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <Label htmlFor="p-freq">Check-in (min)</Label>
                    <Input id="p-freq" type="number" value={policyForm.check_in_minutes} onChange={(e) => setPolicyForm({ ...policyForm, check_in_minutes: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="p-rem">Reminder (min)</Label>
                    <Input id="p-rem" type="number" value={policyForm.reminder_minutes} onChange={(e) => setPolicyForm({ ...policyForm, reminder_minutes: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="p-grace">Grace (min)</Label>
                    <Input id="p-grace" type="number" value={policyForm.grace_minutes} onChange={(e) => setPolicyForm({ ...policyForm, grace_minutes: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="p-esc">Escalate every (min)</Label>
                    <Input id="p-esc" type="number" value={policyForm.escalation_interval_minutes} onChange={(e) => setPolicyForm({ ...policyForm, escalation_interval_minutes: e.target.value })} />
                  </div>
                </div>
                {[1, 2, 3].map((lvl) => {
                  const f = policyForm as unknown as Record<string, string>;
                  const hint = lvl === 1 ? 'Site supervisor' : lvl === 2 ? 'Operations manager' : 'Control room / ARC';
                  return (
                    <div key={lvl} className="grid grid-cols-3 gap-3">
                      <div>
                        <Label htmlFor={`l${lvl}-name`}>Escalation {lvl}</Label>
                        <Input id={`l${lvl}-name`} placeholder={hint} value={f[`l${lvl}_name`]} onChange={(e) => setPolicyForm({ ...policyForm, [`l${lvl}_name`]: e.target.value })} />
                      </div>
                      <div>
                        <Label htmlFor={`l${lvl}-email`}>Email</Label>
                        <Input id={`l${lvl}-email`} value={f[`l${lvl}_email`]} onChange={(e) => setPolicyForm({ ...policyForm, [`l${lvl}_email`]: e.target.value })} />
                      </div>
                      <div>
                        <Label htmlFor={`l${lvl}-phone`}>Mobile</Label>
                        <Input id={`l${lvl}-phone`} value={f[`l${lvl}_phone`]} onChange={(e) => setPolicyForm({ ...policyForm, [`l${lvl}_phone`]: e.target.value })} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPolicyOpen(false)}>Cancel</Button>
                <Button onClick={savePolicy} disabled={!policyForm.name}>Save rule</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </ModulePage>
      </AppShell>
    </ProtectedRoute>
  );
}
