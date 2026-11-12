'use client';

import { AlarmClock, CalendarClock, CheckCircle2, Clock, Hourglass, Target, Timer, XCircle } from 'lucide-react';
import { StatCards, type StatCardSpec } from '@/components/module-dashboard';
import type { PatrolDashboardKpis } from '@/lib/types';

export function PatrolKpiCards({ kpis }: { kpis: PatrolDashboardKpis }) {
  const cards: StatCardSpec[] = [
    { key: 'scheduled', label: 'Scheduled', value: kpis.total_scheduled, icon: CalendarClock, tone: 'neutral' },
    { key: 'completed', label: 'Completed', value: kpis.completed, icon: CheckCircle2, tone: 'positive' },
    { key: 'on_time', label: 'On time', value: kpis.on_time, icon: Clock, tone: 'positive' },
    { key: 'late', label: 'Late', value: kpis.late, icon: AlarmClock, tone: kpis.late > 0 ? 'warning' : 'muted' },
    { key: 'missed', label: 'Missed', value: kpis.missed, icon: XCircle, tone: kpis.missed > 0 ? 'danger' : 'muted' },
    { key: 'pending', label: 'Pending', value: kpis.pending, icon: Hourglass, tone: 'muted' },
    { key: 'lateness', label: 'Avg lateness', value: `${kpis.average_lateness_minutes}m`, icon: Timer, tone: 'info' },
    {
      key: 'completion',
      label: 'Completion',
      value: `${kpis.completion_rate_pct}%`,
      icon: Target,
      tone: kpis.completion_rate_pct >= 90 ? 'positive' : kpis.completion_rate_pct >= 70 ? 'warning' : 'danger',
      progress: { value: kpis.completion_rate_pct },
    },
  ];
  return <StatCards cards={cards} className="xl:grid-cols-4" />;
}
