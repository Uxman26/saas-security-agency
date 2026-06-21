'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { addDays, format, startOfWeek } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { ArrowLeft, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

function statusLabel(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function LeadsCalendarPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const startStr = format(days[0], 'yyyy-MM-dd');
  const endStr = format(days[6], 'yyyy-MM-dd');

  const { data: events = [] } = useQuery({
    queryKey: ['lead-calendar', startStr, endStr],
    queryFn: () => api.leads.followUpCalendar(startStr, endStr),
  });

  const byDay = useMemo(() => {
    const m = new Map<string, Record<string, unknown>[]>();
    for (const d of days) m.set(format(d, 'yyyy-MM-dd'), []);
    for (const e of events) {
      const due = String(e.due_at || '').slice(0, 10);
      if (m.has(due)) m.get(due)!.push(e);
    }
    return m;
  }, [events, days]);

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/leads">
                  <ArrowLeft className="size-4 mr-1" />
                  Leads
                </Link>
              </Button>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Calendar className="size-6" />
                Follow-up calendar
              </h1>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setWeekStart((w) => addDays(w, -7))}>
                Previous
              </Button>
              <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
                Today
              </Button>
              <Button variant="outline" size="sm" onClick={() => setWeekStart((w) => addDays(w, 7))}>
                Next
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {days.map((d) => {
              const key = format(d, 'yyyy-MM-dd');
              const items = byDay.get(key) || [];
              const isToday = key === format(new Date(), 'yyyy-MM-dd');
              return (
                <Card key={key} className={cn(isToday && 'ring-2 ring-primary/40')}>
                  <CardHeader className="pb-2 p-3">
                    <CardTitle className="text-sm font-medium">
                      {format(d, 'EEE d MMM')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 space-y-2 min-h-[120px]">
                    {items.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No follow-ups</p>
                    ) : (
                      items.map((e) => (
                        <Link
                          key={String(e.id)}
                          href={`/leads/${e.lead_id}`}
                          className={cn(
                            'block rounded-md border px-2 py-1.5 text-xs hover:bg-muted/50',
                            e.completed_at ? 'opacity-50' : ''
                          )}
                        >
                          <span className="font-medium">{statusLabel(String(e.activity_type || 'follow-up'))}</span>
                          {e.title ? <span className="text-muted-foreground"> · {String(e.title)}</span> : null}
                          <div className="text-muted-foreground tabular-nums">
                            {String(e.due_at || '').slice(11, 16) || '—'}
                          </div>
                        </Link>
                      ))
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
