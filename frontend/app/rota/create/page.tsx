'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRotaShifts } from '@/contexts/rota-shifts-context';
import type { RotaViewMode } from '@/lib/rota-shifts-types';
import { Calendar, Check, Copy, LayoutGrid, Layers, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function CreateRotaPage() {
  const router = useRouter();
  const { initRota } = useRotaShifts();
  const [mode, setMode] = useState<'new' | 'copy'>('new');
  const [name, setName] = useState('');
  const [duration, setDuration] = useState<string>('7');
  const [customDays, setCustomDays] = useState(14);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [budget, setBudget] = useState('');
  const [view, setView] = useState<RotaViewMode>('table');

  const dayCount =
    duration === 'custom' ? Math.max(1, Math.min(90, customDays)) : parseInt(duration, 10);

  const valid = name.trim().length > 0 && startDate.length > 0;

  const submit = () => {
    if (!valid) return;
    initRota({
      name: name.trim(),
      view,
      startDate,
      dayCount,
      budget: parseFloat(budget.replace(/,/g, '')) || 0,
      copySeed: mode === 'copy',
      includeAllStaff: mode === 'new',
    });
    router.push('/rota/calendar');
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
              <p className="text-sm text-muted-foreground mt-1">Choose how you start, then open the calendar.</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setMode('new')}
                className={cn(
                  'rounded-xl border-2 p-4 text-left transition-colors flex gap-3',
                  mode === 'new' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                )}
              >
                <div className="rounded-lg bg-primary/10 p-2 h-fit">
                  <Calendar className="size-6 text-primary" />
                </div>
                <div>
                  <div className="font-semibold flex items-center gap-2">
                    Create new rota
                    {mode === 'new' ? <Check className="size-4 text-primary" /> : null}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Blank rota with your dates and view.</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setMode('copy')}
                className={cn(
                  'rounded-xl border-2 p-4 text-left transition-colors flex gap-3',
                  mode === 'copy' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                )}
              >
                <div className="rounded-lg bg-primary/10 p-2 h-fit">
                  <Copy className="size-6 text-primary" />
                </div>
                <div>
                  <div className="font-semibold flex items-center gap-2">
                    Copy sample rota
                    {mode === 'copy' ? <Check className="size-4 text-primary" /> : null}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Prefill with up to five guards and sample shifts (uses guards from your Guards list; needs at least three for the full sample).
                  </p>
                </div>
              </button>
            </div>

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
                    <SelectContent>
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
              <Button className="bg-pink-600 hover:bg-pink-700" disabled={!valid} type="button" onClick={submit}>
                Create your rota
              </Button>
            </div>
          </div>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
