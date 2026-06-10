'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import type { RotaPlanListItem } from '@/lib/types';
import type { RotaViewMode } from '@/lib/rota-shifts-types';
import { Calendar, Check, Copy, LayoutGrid, Layers, Loader2, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';

function fmtPeriod(r: RotaPlanListItem) {
  const a = new Date(`${r.start_date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const b = new Date(`${r.end_date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${a} – ${b}`;
}

export default function CreateRotaPage() {
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
    setView((s.view_mode as RotaViewMode) || 'table');
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
        });
        toast.success('Rota copied — review shifts and publish when ready');
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
      const q = new URLSearchParams({ bootstrap: '1', copy: '0', allStaff: '1' });
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
          <div className="container mx-auto px-4 py-8 max-w-2xl space-y-8">
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
                      Blank rota with all staff on the planner. Set shift times, assign employees, then publish.
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
              <div className="grid sm:grid-cols-3 gap-3">
                {(
                  [
                    { id: 'table' as const, title: 'Table view', desc: 'Employees × dates grid.', icon: LayoutGrid },
                    { id: 'timeline' as const, title: 'Timeline view', desc: 'Days as rows, time across.', icon: Timer },
                    { id: 'dnd' as const, title: 'Drag & drop', desc: 'Drag staff onto days.', icon: Layers },
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
              <Button className="bg-pink-600 hover:bg-pink-700" disabled={!valid || saving} type="button" onClick={submit}>
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
