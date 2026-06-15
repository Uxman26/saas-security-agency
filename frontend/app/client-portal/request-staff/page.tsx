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
import { ArrowLeft, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const [shiftDate, setShiftDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [shiftStart, setShiftStart] = useState('09:00');
  const [shiftEnd, setShiftEnd] = useState('17:00');
  const [breakMinutes, setBreakMinutes] = useState(30);
  const [staffCount, setStaffCount] = useState(1);
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

  const submit = async () => {
    const sid = parseInt(siteId, 10);
    if (!sid || !shiftDate || !shiftStart || !shiftEnd) {
      toast.warning('Site, date, and shift times are required');
      return;
    }
    setSaving(true);
    try {
      await api.staffRequests.create({
        client_id: clientId ? parseInt(clientId, 10) : undefined,
        site_id: sid,
        shift_date: shiftDate,
        shift_start: shiftStart,
        shift_end: shiftEnd,
        break_minutes: breakMinutes,
        staff_count: staffCount,
        client_notes: notes.trim() || undefined,
      });
      toast.success('Staff request submitted for review');
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
        <div className="container mx-auto px-4 py-8 max-w-2xl space-y-6">
          <Button variant="ghost" size="sm" className="-ml-2" asChild>
            <Link href="/client-portal">
              <ArrowLeft className="size-4 mr-1" />
              Client portal
            </Link>
          </Button>

          <div>
            <h1 className="text-2xl font-bold">Request staff</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Submit shift date and timings. Your controller or admin will review and add approved shifts to the rota.
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
                <div className="space-y-1.5">
                  <Label>Shift date</Label>
                  <Input type="date" value={shiftDate} onChange={(e) => setShiftDate(e.target.value)} />
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
                  Submit request
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
