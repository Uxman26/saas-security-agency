'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/lib/permissions';
import type { Client, Site, StaffRequest } from '@/lib/types';
import { toast } from '@/lib/toast';
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type EntryMode = 'same' | 'different';

type ShiftRow = {
  key: string;
  shift_date: string;
  shift_start: string;
  shift_end: string;
  break_minutes: number;
  staff_count: number;
};

function newRow(date = ''): ShiftRow {
  return {
    key: `${Date.now()}-${Math.random()}`,
    shift_date: date,
    shift_start: '09:00',
    shift_end: '17:00',
    break_minutes: 30,
    staff_count: 1,
  };
}

function statusBadge(status: string) {
  const s = status.toLowerCase();
  const cls =
    s === 'approved'
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
      : s === 'rejected'
        ? 'bg-red-500/15 text-red-700 dark:text-red-400'
        : 'bg-amber-500/15 text-amber-800 dark:text-amber-400';
  return <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize', cls)}>{status}</span>;
}

function RequestStaffPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') === 'history' ? 'history' : 'new';
  const { user } = useAuth();

  const [clients, setClients] = useState<Client[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [requests, setRequests] = useState<StaffRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [clientId, setClientId] = useState<string>('');
  const [siteId, setSiteId] = useState<string>('');
  const [entryMode, setEntryMode] = useState<EntryMode>('same');
  const [dates, setDates] = useState<string[]>([new Date().toISOString().slice(0, 10)]);
  const [shiftStart, setShiftStart] = useState('09:00');
  const [shiftEnd, setShiftEnd] = useState('17:00');
  const [breakMinutes, setBreakMinutes] = useState(30);
  const [staffCount, setStaffCount] = useState(1);
  const [rows, setRows] = useState<ShiftRow[]>([newRow(new Date().toISOString().slice(0, 10))]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      can(user, 'clients.read') ? api.clients.list() : Promise.resolve([]),
      can(user, 'sites.read') ? api.sites.list() : Promise.resolve([]),
      api.staffRequests.list(),
    ])
      .then(([c, s, r]) => {
        setClients(c);
        setSites(s);
        setRequests(r);
        if (user?.client_id) {
          setClientId(String(user.client_id));
        } else if (c.length === 1) {
          setClientId(String(c[0].id));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  const clientSites = useMemo(() => sites, [sites]);

  const updateRow = (key: string, patch: Partial<ShiftRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const submit = async () => {
    const sid = parseInt(siteId, 10);
    if (!sid) {
      toast.warning('Site is required');
      return;
    }

    let shifts: { shift_date: string; shift_start?: string; shift_end?: string; break_minutes?: number; staff_count?: number }[] = [];

    if (entryMode === 'same') {
      if (!shiftStart || !shiftEnd) {
        toast.warning('Shift times are required');
        return;
      }
      const uniqueDates = [...new Set(dates.map((d) => d.trim()).filter(Boolean))];
      if (!uniqueDates.length) {
        toast.warning('Add at least one shift date');
        return;
      }
      shifts = uniqueDates.map((shift_date) => ({ shift_date }));
    } else {
      const valid = rows.filter((r) => r.shift_date && r.shift_start && r.shift_end);
      if (!valid.length) {
        toast.warning('Add at least one complete shift row');
        return;
      }
      shifts = valid.map((r) => ({
        shift_date: r.shift_date,
        shift_start: r.shift_start,
        shift_end: r.shift_end,
        break_minutes: r.break_minutes,
        staff_count: r.staff_count,
      }));
    }

    setSaving(true);
    try {
      const created = await api.staffRequests.createBulk({
        client_id: clientId ? parseInt(clientId, 10) : undefined,
        site_id: sid,
        shift_start: entryMode === 'same' ? shiftStart : rows[0]?.shift_start || '09:00',
        shift_end: entryMode === 'same' ? shiftEnd : rows[0]?.shift_end || '17:00',
        break_minutes: entryMode === 'same' ? breakMinutes : rows[0]?.break_minutes ?? 30,
        staff_count: entryMode === 'same' ? staffCount : rows[0]?.staff_count ?? 1,
        client_notes: notes.trim() || undefined,
        shifts,
      });
      toast.success(`${created.length} staff request${created.length === 1 ? '' : 's'} submitted for review`);
      const list = await api.staffRequests.list();
      setRequests(list);
      router.push('/client-portal/request-staff?tab=history');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to submit');
    } finally {
      setSaving(false);
    }
  };

  if (!can(user, 'staff_req.write')) {
    return (
      <ProtectedRoute>
        <AppShell>
          <div className="container mx-auto px-4 py-12 text-center text-muted-foreground">
            You do not have permission to submit staff requests.
          </div>
        </AppShell>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8 space-y-6">
          <Button variant="ghost" size="sm" className="-ml-2" asChild>
            <Link href="/client-portal">
              <ArrowLeft className="size-4 mr-1" />
              Client portal
            </Link>
          </Button>

          <div>
            <h1 className="text-2xl font-bold">Request staff</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Submit one or more shift dates in a single request. Your controller or admin will review and add approved shifts to the rota.
            </p>
          </div>

          <div className="flex gap-2 border-b">
            <Link
              href="/client-portal/request-staff"
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
                tab === 'new' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
              )}
            >
              New request
            </Link>
            <Link
              href="/client-portal/request-staff?tab=history"
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
                tab === 'history' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
              )}
            >
              My requests
            </Link>
          </div>

          {loading ? (
            <div className="flex justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="size-5 animate-spin" />
              Loading…
            </div>
          ) : tab === 'history' ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Request history</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {requests.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No requests yet.</p>
                ) : (
                  requests.map((r) => (
                    <div key={r.id} className="rounded-lg border p-3 text-sm space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{r.site_name}</span>
                        {statusBadge(r.status)}
                      </div>
                      <p className="text-muted-foreground">
                        {r.shift_date} · {r.shift_start} – {r.shift_end}
                        {r.staff_count > 1 ? ` · ${r.staff_count} staff` : ''}
                      </p>
                      {r.client_notes ? <p className="text-xs text-muted-foreground">{r.client_notes}</p> : null}
                      {r.reviewer_comment ? (
                        <p className="text-xs rounded bg-muted/50 p-2">
                          <span className="font-medium">Review: </span>
                          {r.reviewer_comment}
                        </p>
                      ) : null}
                      {r.status === 'approved' && r.rota_plan_id ? (
                        <Link href={`/rota/calendar?id=${r.rota_plan_id}`} className="text-xs text-sky-600 hover:underline">
                          View on rota
                        </Link>
                      ) : null}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6 grid gap-4">
                {!user?.client_id && clients.length > 0 && (
                  <div className="space-y-1.5">
                    <Label>Client</Label>
                    <Select value={clientId || undefined} onValueChange={(v) => { setClientId(v); setSiteId(''); }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select client" />
                      </SelectTrigger>
                      <SelectContent position="popper" className="z-[200]">
                        {clients.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Site / location</Label>
                  <Select value={siteId || undefined} onValueChange={setSiteId} disabled={!clientSites.length}>
                    <SelectTrigger>
                      <SelectValue placeholder={clientSites.length ? 'Select site' : 'No sites for this client'} />
                    </SelectTrigger>
                    <SelectContent position="popper" className="z-[200]">
                      {clientSites.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Booking style</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={entryMode === 'same' ? 'default' : 'outline'}
                      onClick={() => setEntryMode('same')}
                    >
                      Same timings for all dates
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={entryMode === 'different' ? 'default' : 'outline'}
                      onClick={() => setEntryMode('different')}
                    >
                      Different timings per date
                    </Button>
                  </div>
                </div>

                {entryMode === 'same' ? (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Shift dates</Label>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setDates((d) => [...d, ''])}
                        >
                          <Plus className="size-3.5 mr-1" />
                          Add date
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {dates.map((d, i) => (
                          <div key={i} className="flex gap-2">
                            <Input
                              type="date"
                              value={d}
                              onChange={(e) => setDates((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                            />
                            {dates.length > 1 && (
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() => setDates((prev) => prev.filter((_, j) => j !== i))}
                              >
                                <Trash2 className="size-4 text-muted-foreground" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Start time</Label>
                        <Input type="time" value={shiftStart} onChange={(e) => setShiftStart(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>End time</Label>
                        <Input type="time" value={shiftEnd} onChange={(e) => setShiftEnd(e.target.value)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Break (mins)</Label>
                        <Input
                          type="number"
                          min={0}
                          value={breakMinutes}
                          onChange={(e) => setBreakMinutes(parseInt(e.target.value, 10) || 0)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Staff needed</Label>
                        <Input
                          type="number"
                          min={1}
                          max={50}
                          value={staffCount}
                          onChange={(e) => setStaffCount(parseInt(e.target.value, 10) || 1)}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Shifts</Label>
                      <Button type="button" size="sm" variant="outline" onClick={() => setRows((r) => [...r, newRow()])}>
                        <Plus className="size-3.5 mr-1" />
                        Add shift
                      </Button>
                    </div>
                    <div className="space-y-3">
                      {rows.map((row) => (
                        <div key={row.key} className="rounded-lg border p-3 space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-muted-foreground">Shift</span>
                            {rows.length > 1 && (
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-7"
                                onClick={() => setRows((r) => r.filter((x) => x.key !== row.key))}
                              >
                                <Trash2 className="size-3.5 text-muted-foreground" />
                              </Button>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            <Label>Date</Label>
                            <Input
                              type="date"
                              value={row.shift_date}
                              onChange={(e) => updateRow(row.key, { shift_date: e.target.value })}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label>Start</Label>
                              <Input
                                type="time"
                                value={row.shift_start}
                                onChange={(e) => updateRow(row.key, { shift_start: e.target.value })}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label>End</Label>
                              <Input
                                type="time"
                                value={row.shift_end}
                                onChange={(e) => updateRow(row.key, { shift_end: e.target.value })}
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label>Break (mins)</Label>
                              <Input
                                type="number"
                                min={0}
                                value={row.break_minutes}
                                onChange={(e) => updateRow(row.key, { break_minutes: parseInt(e.target.value, 10) || 0 })}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label>Staff</Label>
                              <Input
                                type="number"
                                min={1}
                                max={50}
                                value={row.staff_count}
                                onChange={(e) => updateRow(row.key, { staff_count: parseInt(e.target.value, 10) || 1 })}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <textarea
                    className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="Instructions, access details, or special requirements"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
                <Button className="bg-pink-600 hover:bg-pink-700 w-full" disabled={saving} onClick={() => void submit()}>
                  {saving ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : null}
                  Submit request{entryMode === 'same' && dates.filter(Boolean).length > 1 ? 's' : ''}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}

export default function RequestStaffPageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>}>
      <RequestStaffPage />
    </Suspense>
  );
}
