'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { axisLineProps, chartTooltipStyle, tickProps, useChartTheme } from '@/lib/chart-theme';

type MonthlyPoint = { label: string; revenue: number; expenses: number; staff_hours: number };
type SubPoint = { label: string; amount: number; invoices: number };

type Props = {
  monthly: MonthlyPoint[];
  subscription: SubPoint[];
};

export function ReportsHubCharts({ monthly, subscription }: Props) {
  const c = useChartTheme();
  const tooltip = chartTooltipStyle(c);
  const tick = tickProps(c, 11);
  const axisLine = axisLineProps(c);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <p className="text-sm font-semibold mb-1">Monthly trends</p>
        <p className="text-xs text-muted-foreground mb-4">Revenue, expenses & staff hours (6 months)</p>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
              <XAxis dataKey="label" tick={tick} axisLine={axisLine} tickLine={false} />
              <YAxis yAxisId="l" tick={tick} axisLine={axisLine} tickLine={false} width={48} />
              <YAxis yAxisId="r" orientation="right" tick={tick} axisLine={axisLine} tickLine={false} width={40} />
              <Tooltip contentStyle={tooltip} />
              <Legend />
              <Line yAxisId="l" type="monotone" dataKey="revenue" name="Revenue" stroke={c.primary} strokeWidth={2} dot={false} />
              <Line yAxisId="l" type="monotone" dataKey="expenses" name="Expenses" stroke={c.warn} strokeWidth={2} dot={false} />
              <Line yAxisId="r" type="monotone" dataKey="staff_hours" name="Hours" stroke={c.accent} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <p className="text-sm font-semibold mb-1">Subscription billing</p>
        <p className="text-xs text-muted-foreground mb-4">Platform subscription invoices (6 months)</p>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={subscription} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
              <XAxis dataKey="label" tick={tick} axisLine={axisLine} tickLine={false} />
              <YAxis tick={tick} axisLine={axisLine} tickLine={false} width={48} />
              <Tooltip contentStyle={tooltip} />
              <Bar dataKey="amount" name="Billed (£)" fill={c.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
