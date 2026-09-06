'use client';

/**
 * Employee Profile → Overtime.
 *
 * Reads the shift-overtime and early-finish logs the rota already writes, rather than
 * introducing a second place overtime can be recorded. Overtime is a fact about a shift,
 * so it is logged against the shift in the rota and simply reported here.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { formatDateUK } from '@/lib/date-format';

type Row = Record<string, unknown>;

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function str(row: Row, key: string): string {
  const v = row[key];
  return v == null ? '' : String(v);
}

/** Minutes between two clock times, tolerating an overnight roll. */
function minutesBetween(from?: string, to?: string): number | null {
  const parse = (t?: string) => {
    if (!t) return null;
    const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
  };
  const a = parse(from);
  const b = parse(to);
  if (a == null || b == null) return null;
  return b >= a ? b - a : b + 24 * 60 - a;
}

function hm(mins: number | null) {
  if (mins == null) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function OvertimeTab({ guardId }: { guardId: number }) {
  const [from, setFrom] = useState(() => iso(new Date(new Date().getFullYear(), 0, 1)));
  const [to, setTo] = useState(() => iso(new Date(new Date().getFullYear(), 11, 31)));
  // Keyed by the window it was fetched for, so a date change reads as "loading" without
  // writing state synchronously inside the effect.
  const [loaded, setLoaded] = useState<{ key: string; overtime: Row[]; early: Row[] } | null>(null);
  const queryKey = `${guardId}|${from}|${to}`;

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.reports.shiftOvertime(from, to, guardId).catch(() => [] as Row[]),
      api.reports.shiftEarlyFinish(from, to, guardId).catch(() => [] as Row[]),
    ]).then(([o, e]) => alive && setLoaded({ key: queryKey, overtime: o, early: e }));
    return () => {
      alive = false;
    };
  }, [queryKey, from, to, guardId]);

  const loading = loaded?.key !== queryKey;
  const overtime = useMemo(() => (loaded?.key === queryKey ? loaded.overtime : []), [loaded, queryKey]);
  const early = useMemo(() => (loaded?.key === queryKey ? loaded.early : []), [loaded, queryKey]);

  const totalOvertime = useMemo(
    () =>
      overtime.reduce(
        (n, r) => n + (minutesBetween(str(r, 'scheduled_end'), str(r, 'new_end')) ?? 0),
        0
      ),
    [overtime]
  );
  const totalEarly = useMemo(
    () =>
      early.reduce(
        (n, r) => n + (minutesBetween(str(r, 'actual_end'), str(r, 'scheduled_end')) ?? 0),
        0
      ),
    [early]
  );

  const shiftYear = (dir: -1 | 1) => {
    const s = new Date(`${from}T12:00:00`);
    const e = new Date(`${to}T12:00:00`);
    s.setFullYear(s.getFullYear() + dir);
    e.setFullYear(e.getFullYear() + dir);
    setFrom(iso(s));
    setTo(iso(e));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-1 rounded-md border px-1 py-0.5">
        <Button variant="ghost" size="icon" className="size-7" onClick={() => shiftYear(-1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <Input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="h-7 w-[132px] border-0 px-1 text-xs shadow-none focus-visible:ring-0"
          aria-label="From"
        />
        <span className="text-xs text-muted-foreground">–</span>
        <Input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="h-7 w-[132px] border-0 px-1 text-xs shadow-none focus-visible:ring-0"
          aria-label="To"
        />
        <Button variant="ghost" size="icon" className="size-7" onClick={() => shiftYear(1)}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Overtime logged</p>
            <p className="text-2xl font-bold tabular-nums">{hm(totalOvertime)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {overtime.length} shift{overtime.length === 1 ? '' : 's'} ran over
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Early finishes</p>
            <p className="text-2xl font-bold tabular-nums">{hm(totalEarly)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {early.length} shift{early.length === 1 ? '' : 's'} finished early
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          {loading ? (
            <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading overtime…
            </p>
          ) : overtime.length === 0 && early.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No overtime or early finishes logged in this period. They are recorded against the
              shift itself on the{' '}
              <Link href="/rota" className="text-primary underline">
                rota
              </Link>
              .
            </p>
          ) : (
            <div className="divide-y">
              {overtime.map((r, i) => (
                <div key={`ot-${str(r, 'id') || i}`} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                  <span className="w-28 shrink-0 font-medium">Overtime</span>
                  <span className="text-muted-foreground">
                    {str(r, 'shift_date') ? formatDateUK(str(r, 'shift_date')) : '—'}
                  </span>
                  <span className="text-muted-foreground">
                    {str(r, 'scheduled_end')} → {str(r, 'new_end')}
                  </span>
                  <span className="tabular-nums">
                    {hm(minutesBetween(str(r, 'scheduled_end'), str(r, 'new_end')))}
                  </span>
                  {str(r, 'reason') ? (
                    <span className="truncate text-xs text-muted-foreground">{str(r, 'reason')}</span>
                  ) : null}
                </div>
              ))}
              {early.map((r, i) => (
                <div key={`ef-${str(r, 'id') || i}`} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                  <span className="w-28 shrink-0 font-medium">Early finish</span>
                  <span className="text-muted-foreground">
                    {str(r, 'shift_date') ? formatDateUK(str(r, 'shift_date')) : '—'}
                  </span>
                  <span className="text-muted-foreground">
                    {str(r, 'scheduled_end')} → {str(r, 'actual_end')}
                  </span>
                  <span className="tabular-nums">
                    {hm(minutesBetween(str(r, 'actual_end'), str(r, 'scheduled_end')))}
                  </span>
                  {str(r, 'reason') ? (
                    <span className="truncate text-xs text-muted-foreground">{str(r, 'reason')}</span>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
