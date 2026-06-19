'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRotaShifts } from '@/contexts/rota-shifts-context';
import { attKey, calcHours, fmtShortDate, initials } from '@/lib/rota-shifts-utils';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function RotaAttendanceReportPage() {
  const { state } = useRotaShifts();
  const [from, setFrom] = useState(state.days[0] || '');
  const [to, setTo] = useState(state.days[state.days.length - 1] || '');
  const [empId, setEmpId] = useState<string>('__all');

  const rows = useMemo(() => {
    const out: { dk: string; empId: string; idx: number; hours: number; site: string; start: string; end: string; scheduledStart?: string }[] = [];
    const f = from || state.days[0];
    const t = to || state.days[state.days.length - 1];
    if (!f || !t) return out;
    for (const e of state.employees) {
      if (empId !== '__all' && e.id !== empId) continue;
      for (const dk of state.days) {
        if (dk < f || dk > t) continue;
        const list = state.shifts[e.id]?.[dk] || [];
        list.forEach((sh, idx) => {
          out.push({
            dk,
            empId: e.id,
            idx,
            hours: calcHours(sh),
            site: sh.site,
            start: sh.start,
            end: sh.end,
            scheduledStart: sh.scheduledStart,
          });
        });
      }
    }
    return out.sort((a, b) => (a.dk !== b.dk ? a.dk.localeCompare(b.dk) : a.empId.localeCompare(b.empId)));
  }, [state, from, to, empId]);

  const byEmp = useMemo(() => {
    const m = new Map<
      string,
      {
        emp: (typeof state.employees)[0];
        totalH: number;
        present: number;
        absent: number;
        late: number;
        lateMinutes: number;
      }
    >();
    for (const e of state.employees) {
      if (empId !== '__all' && e.id !== empId) continue;
      let totalH = 0;
      let present = 0;
      let absent = 0;
      let late = 0;
      let lateMinutes = 0;
      const f = from || state.days[0];
      const t = to || state.days[state.days.length - 1];
      if (!f || !t) continue;
      for (const dk of state.days) {
        if (dk < f || dk > t) continue;
        const list = state.shifts[e.id]?.[dk] || [];
        list.forEach((sh, idx) => {
          totalH += calcHours(sh);
          const a = state.attendance[attKey(e.id, dk, idx)];
          if (a?.status === 'present') present++;
          else if (a?.status === 'absent') absent++;
          else if (a?.status === 'late') {
            late++;
            lateMinutes += a.lateMinutes || 0;
          }
        });
      }
      m.set(e.id, { emp: e, totalH, present, absent, late, lateMinutes });
    }
    return m;
  }, [state, from, to, empId]);

  const exportCsv = () => {
    const lines = ['date,employee,role,scheduled_start,start,end,site,hours,attendance,late_minutes,note'];
    const f = from || state.days[0];
    const t = to || state.days[state.days.length - 1];
    for (const e of state.employees) {
      if (empId !== '__all' && e.id !== empId) continue;
      for (const dk of state.days) {
        if (dk < f || dk > t) continue;
        const list = state.shifts[e.id]?.[dk] || [];
        list.forEach((sh, idx) => {
          const a = state.attendance[attKey(e.id, dk, idx)];
          lines.push(
            [
              dk,
              e.name,
              e.role,
              sh.scheduledStart || sh.start,
              sh.start,
              sh.end,
              sh.site,
              calcHours(sh).toFixed(2),
              a?.status || '',
              a?.lateMinutes ?? '',
              (a?.note || '').replace(/,/g, ';'),
            ].join(',')
          );
        });
      }
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rota-attendance.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
          <div className="container mx-auto px-4 py-8 space-y-6">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/rota/calendar">
                <ArrowLeft className="size-4 mr-1" />
                Back to calendar
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">Attendance report</h1>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Filters</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-4 items-end">
                <div className="space-y-1">
                  <Label>From</Label>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>To</Label>
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
                <div className="space-y-1 min-w-[200px]">
                  <Label>Employee</Label>
                  <Select value={empId} onValueChange={setEmpId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">All</SelectItem>
                      {state.employees.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" variant="secondary">
                  Apply
                </Button>
                <Button type="button" variant="outline" onClick={exportCsv}>
                  Export CSV
                </Button>
              </CardContent>
            </Card>

            {[...byEmp.values()].map(({ emp, totalH, present, absent, late, lateMinutes }) => (
              <Card key={emp.id}>
                <CardHeader className="flex flex-row items-start gap-4 pb-2">
                  <span
                    className="size-12 rounded-full flex items-center justify-center text-sm font-semibold text-white shrink-0"
                    style={{ backgroundColor: emp.avatarColor }}
                  >
                    {initials(emp.name)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg">{emp.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{emp.role}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className="text-xs rounded-full bg-muted px-2 py-0.5 tabular-nums">{totalH.toFixed(1)}h total</span>
                      <span className="text-xs rounded-full bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 px-2 py-0.5">{present} present</span>
                      <span className="text-xs rounded-full bg-red-500/15 text-red-800 dark:text-red-300 px-2 py-0.5">{absent} absent</span>
                      <span className="text-xs rounded-full bg-amber-500/15 text-amber-900 dark:text-amber-200 px-2 py-0.5">{late} late</span>
                      {lateMinutes > 0 ? (
                        <span className="text-xs rounded-full bg-amber-500/15 text-amber-900 dark:text-amber-200 px-2 py-0.5 tabular-nums">
                          {lateMinutes} late mins
                        </span>
                      ) : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-3">Date</th>
                        <th className="py-2 pr-3">Time</th>
                        <th className="py-2 pr-3">Site</th>
                        <th className="py-2 pr-3">Hours</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2">Late mins</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows
                        .filter((r) => r.empId === emp.id)
                        .map((r) => {
                          const a = state.attendance[attKey(r.empId, r.dk, r.idx)];
                          return (
                            <tr key={`${r.dk}-${r.idx}`} className="border-b border-border/50">
                              <td className="py-2 pr-3 whitespace-nowrap">{fmtShortDate(r.dk)}</td>
                              <td className="py-2 pr-3 tabular-nums">
                                {r.scheduledStart && r.scheduledStart !== r.start ? `${r.scheduledStart}→${r.start}` : `${r.start}–${r.end}`}
                              </td>
                              <td className="py-2 pr-3">{r.site}</td>
                              <td className="py-2 pr-3 tabular-nums">{r.hours.toFixed(2)}</td>
                              <td className="py-2">
                                <span
                                  className={cn(
                                    'text-xs rounded-full px-2 py-0.5',
                                    a?.status === 'present' && 'bg-emerald-500/15',
                                    a?.status === 'absent' && 'bg-red-500/15',
                                    a?.status === 'late' && 'bg-amber-500/15',
                                    !a && 'bg-muted'
                                  )}
                                >
                                  {a?.status || '—'}
                                </span>
                              </td>
                              <td className="py-2 tabular-nums">{a?.lateMinutes ?? '—'}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            ))}

            {state.employees.length === 0 ? <p className="text-sm text-muted-foreground">Add employees on the calendar to see this report.</p> : null}
          </div>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
