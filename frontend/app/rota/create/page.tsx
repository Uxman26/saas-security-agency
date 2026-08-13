'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import type { RotaPlanListItem, Guard } from '@/lib/types';
import type { RotaViewMode } from '@/lib/rota-shifts-types';
import { Calendar, Check, Copy, LayoutGrid, Loader2, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';

function fmtPeriod(r: RotaPlanListItem) {
  const a = new Date(`${r.start_date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const b = new Date(`${r.end_date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${a} – ${b}`;
}

function CreateRotaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromParam = searchParams.get('from');
  const fromId = fromParam ? parseInt(fromParam, 10) : null;

  const [mode, setMode] = useState<'new' | 'copy'>(fromId ? 'copy' : 'new');
  const [rotas, setRotas] = useState<RotaPlanListItem[]>([]);
  const [rotasLoading, setRotasLoading] = useState(false);
  const [sourceId, setSourceId] = useState<number | null>(fromId && !Number.isNaN(fromId) ? fromId : null);
  const [name, setName] = useState('');
  const [duration, setDuration] = useState<string>('7');
  const [customDays, setCustomDays] = useState(14);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [budget, setBudget] = useState('');
  const [view, setView] = useState<RotaViewMode>('table');
  const [saving, setSaving] = useState(false);
  const [guards, setGuards] = useState<Guard[]>([]);
  const [guardsLoading, setGuardsLoading] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<Set<number>>(new Set());
  const [staffSearch, setStaffSearch] = useState('');
  const [copyAttendanceAndNotes, setCopyAttendanceAndNotes] = useState(false);

  useEffect(() => {
    if (mode !== 'new') return;
    setGuardsLoading(true);
    api.guards
      .list()
      .then(setGuards)
      .catch(() => setGuards([]))
      .finally(() => setGuardsLoading(false));
  }, [mode]);

  useEffect(() => {
    if (mode !== 'copy') return;
    setRotasLoading(true);
    api.rotaPlans
      .list()
      .then(setRotas)
      .catch(() => setRotas([]))
      .finally(() => setRotasLoading(false));
  }, [mode]);

  useEffect(() => {
    if (mode !== 'copy' || !rotas.length) return;
    if (sourceId && rotas.some((r) => r.id === sourceId)) return;
    const pick = fromId && rotas.some((r) => r.id === fromId) ? fromId : rotas[0].id;
    setSourceId(pick);
  }, [mode, rotas, sourceId, fromId]);

  const source = useMemo(() => rotas.find((r) => r.id === sourceId) ?? null, [rotas, sourceId]);

  useEffect(() => {
    if (mode !== 'copy' || !sourceId) return;
    const s = rotas.find((r) => r.id === sourceId);
    if (!s) return;
    setName(`${s.name} (copy)`);
    if ([7, 14, 28].includes(s.day_count)) {
      setDuration(String(s.day_count));
    } else {
      setCustomDays(s.day_count);
      setDuration('custom');
    }
    setView((s.view_mode === 'dnd' ? 'table' : (s.view_mode as RotaViewMode)) || 'table');
    setBudget(s.budget ? String(s.budget) : '');
  }, [sourceId, mode, rotas]);

  const dayCount =
    duration === 'custom' ? Math.max(1, Math.min(90, customDays)) : parseInt(duration, 10);

  const valid =
    name.trim().length > 0 &&
    startDate.length > 0 &&
    (mode === 'new' || (sourceId !== null && rotas.some((r) => r.id === sourceId)));

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      if (mode === 'copy' && sourceId) {
        const plan = await api.rotaPlans.copy(sourceId, {
          name: name.trim(),
          start_date: startDate,
          day_count: dayCount,
          view_mode: view,
          budget: parseFloat(budget.replace(/,/g, '')) || 0,
          include_attendance_and_notes: copyAttendanceAndNotes,
        });
        toast.success(
          copyAttendanceAndNotes
            ? 'Rota copied with attendance and notes — review and publish when ready'
            : 'Rota copied (attendance and notes skipped) — review and publish when ready'
        );
        router.push(`/rota/calendar?id=${plan.id}`);
        return;
      }
      const plan = await api.rotaPlans.create({
        name: name.trim(),
        start_date: startDate,
        day_count: dayCount,
        view_mode: view,
        budget: parseFloat(budget.replace(/,/g, '')) || 0,
      });
      const q = new URLSearchParams({ bootstrap: '1', copy: '0' });
      if (selectedStaff.size > 0) {
        q.set('staffIds', [...selectedStaff].join(','));
      }
      router.push(`/rota/calendar?id=${plan.id}&${q.toString()}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create rota');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
          <div className="container mx-auto px-4 py-8 space-y-6">
            <Button variant="ghost" size="sm" className="-ml-2 mb-2" type="button" onClick={() => router.push('/rota')}>
              ← Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Create a rota</h1>
              <p className="text-sm text-muted-foreground mt-1">Start fresh or copy shifts from a previous rota with a new start date.</p>
            </div>

            <div>
              <p className="text-sm font-medium mb-3">What would you like to do?</p>
              <div className="grid sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setMode('new')}
                  className={cn(
                    'rounded-xl border-2 p-4 text-left transition-colors flex gap-3 relative',
                    mode === 'new' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-3 right-3 size-4 rounded-full border-2',
                      mode === 'new' ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                    )}
                  />
                  <div className="rounded-lg bg-primary/10 p-2 h-fit">
                    <Calendar className="size-6 text-primary" />
                  </div>
                  <div className="pr-6">
                    <div className="font-semibold">Create a new rota</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Start with a blank planner. Choose which staff to include, then add shifts and publish.
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('copy')}
                  className={cn(
                    'rounded-xl border-2 p-4 text-left transition-colors flex gap-3 relative',
                    mode === 'copy' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-3 right-3 size-4 rounded-full border-2',
                      mode === 'copy' ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                    )}
                  />
                  <div className="rounded-lg bg-primary/10 p-2 h-fit">
                    <Copy className="size-6 text-primary" />
                  </div>
                  <div className="pr-6">
                    <div className="font-semibold">Copy an existing rota</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Pull through existing shifts and notes. Pick a new start date and edit before publishing.
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {mode === 'copy' ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Source rota</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {rotasLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                      <Loader2 className="size-4 animate-spin" />
                      Loading rotas…
                    </div>
                  ) : rotas.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No rotas to copy yet. Create a rota first.</p>
                  ) : (
                    <div className="space-y-1.5">
                      <Label>Copy from</Label>
                      <Select
                        value={sourceId?.toString() ?? undefined}
                        onValueChange={(v) => setSourceId(parseInt(v, 10))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select rota" />
                        </SelectTrigger>
                        <SelectContent position="popper" className="z-[250]">
                          {rotas.map((r) => (
                            <SelectItem key={r.id} value={String(r.id)}>
                              {r.name} · {fmtPeriod(r)} · {r.shift_count} shifts
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {source ? (
                    <p className="text-xs text-muted-foreground rounded-md border bg-muted/30 p-3">
                      Copies <strong>{source.shift_count}</strong> shift(s) for <strong>{source.staff_count}</strong> staff
                      from <strong>{fmtPeriod(source)}</strong>. Shifts are moved to your new start date.
                    </p>
                  ) : null}
                  <label className="flex items-start gap-3 rounded-md border p-3 text-sm cursor-pointer hover:bg-muted/30">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={copyAttendanceAndNotes}
                      onChange={(e) => setCopyAttendanceAndNotes(e.target.checked)}
                    />
                    <span>
                      <span className="font-medium">Copy attendance records and notes as well?</span>
                      <span className="block text-xs text-muted-foreground mt-1">
                        Off by default. Includes overtime, early finish, on-time status, attendance, and shift notes.
                      </span>
                    </span>
                  </label>
                </CardContent>
              </Card>
            ) : null}

            {mode === 'new' ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Select staff to include</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Choose which employees to add to this rota. You can add or remove staff later in the planner.
                  </p>
                  <Input
                    placeholder="Search staff…"
                    value={staffSearch}
                    onChange={(e) => setStaffSearch(e.target.value)}
                  />
                  {guardsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                      <Loader2 className="size-4 animate-spin" />
                      Loading staff…
                    </div>
                  ) : guards.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No staff in directory yet.</p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto rounded-md border divide-y">
                      {guards
                        .filter((g) => g.full_name.toLowerCase().includes(staffSearch.toLowerCase()))
                        .map((g) => (
                          <label key={g.id} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/40 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedStaff.has(g.id)}
                              onChange={(e) => {
                                setSelectedStaff((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(g.id);
                                  else next.delete(g.id);
                                  return next;
                                });
                              }}
                            />
                            <span className="min-w-0">
                              <span className="font-medium block">{g.full_name}</span>
                              {g.job_title ? (
                                <span className="text-xs text-muted-foreground block">{g.job_title}</span>
                              ) : null}
                            </span>
                          </label>
                        ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {selectedStaff.size} staff selected
                    {selectedStaff.size === 0 ? ' — rota will start empty' : ''}
                  </p>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Details</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="rn">Rota name</Label>
                  <Input id="rn" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. April front line" />
                </div>
                <div className="space-y-1.5">
                  <Label>Rota duration</Label>
                  <Select value={duration} onValueChange={setDuration}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" className="z-[250]">
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="14">14 days</SelectItem>
                      <SelectItem value="28">28 days</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {duration === 'custom' ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="cd">Custom days</Label>
                    <Input
                      id="cd"
                      type="number"
                      min={1}
                      max={90}
                      value={customDays}
                      onChange={(e) => setCustomDays(parseInt(e.target.value, 10) || 1)}
                    />
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <Label htmlFor="sd">Rota start date</Label>
                  <Input id="sd" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bud">Rota budget (£)</Label>
                  <Input id="bud" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="1000.00" />
                </div>
              </CardContent>
            </Card>

            <div>
              <p className="text-sm font-medium mb-3">Select your rota view</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {(
                  [
                    { id: 'table' as const, title: 'Table view', desc: 'Employees × dates grid.', icon: LayoutGrid },
                    { id: 'timeline' as const, title: 'Timeline view', desc: 'Shifts along a 24-hour time flow.', icon: Timer },
                  ] as const
                ).map(({ id, title, desc, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setView(id)}
                    className={cn(
                      'rounded-xl border-2 p-3 text-left transition-colors',
                      view === id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                    )}
                  >
                    <Icon className="size-5 text-primary mb-2" />
                    <div className="font-medium text-sm">{title}</div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <Button disabled={!valid || saving} type="button" onClick={submit}>
                {saving ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : null}
                {mode === 'copy' ? 'Copy rota' : 'Create your rota'}
              </Button>
            </div>
          </div>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}

export default function CreateRotaPageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>}>
      <CreateRotaPage />
    </Suspense>
  );
}
