'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartPoint } from '@/lib/types';
import { axisLineProps, chartTooltipStyle, tickProps, useChartTheme } from '@/lib/chart-theme';

const fmtDay = (iso: string) => {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

type Props = {
  shifts: ChartPoint[];
  attendance: ChartPoint[];
  payroll: ChartPoint[];
  operations: ChartPoint[];
};

export function OverviewCharts({ shifts, attendance, payroll, operations }: Props) {
  const c = useChartTheme();
  const pieColors = [c.primary, c.accent, c.warn, c.danger, c.muted];
  const shiftData = shifts.map((p) => ({ ...p, day: fmtDay(p.label) }));
  const tooltip = chartTooltipStyle(c);
  const tick = tickProps(c);
  const tickSm = tickProps(c, 11);
  const axisLine = axisLineProps(c);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm p-4 shadow-sm">
        <p className="text-sm font-semibold text-foreground mb-1">Shift volume</p>
        <p className="text-xs text-muted-foreground mb-4">Last 14 days and next 7 days</p>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={shiftData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="shiftFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c.primary} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={c.primary} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
              <XAxis dataKey="day" tick={tick} axisLine={axisLine} tickLine={axisLine} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={tick} axisLine={axisLine} tickLine={axisLine} width={28} />
              <Tooltip
                contentStyle={tooltip}
                labelStyle={{ color: c.foreground }}
                itemStyle={{ color: c.foreground }}
                labelFormatter={(_, payload) => {
                  const row = payload?.[0]?.payload as { label?: string } | undefined;
                  return row?.label ? fmtDay(row.label) : '';
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                name="Shifts"
                stroke={c.primary}
                fill="url(#shiftFill)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, fill: c.accent }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm p-4 shadow-sm">
        <p className="text-sm font-semibold text-foreground mb-1">Payroll by month</p>
        <p className="text-xs text-muted-foreground mb-4">Bank + cash totals (6 months)</p>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={payroll} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
              <XAxis dataKey="label" tick={tick} axisLine={axisLine} tickLine={axisLine} />
              <YAxis
                tick={tick}
                axisLine={axisLine}
                tickLine={axisLine}
                width={40}
                tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(v) => [`£${Number(v ?? 0).toLocaleString('en-GB')}`, 'Payroll']}
                contentStyle={tooltip}
                labelStyle={{ color: c.foreground }}
                itemStyle={{ color: c.foreground }}
              />
              <Bar dataKey="value" name="Payroll" fill={c.accent} radius={[6, 6, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm p-4 shadow-sm">
        <p className="text-sm font-semibold text-foreground mb-1">Attendance (30 days)</p>
        <p className="text-xs text-muted-foreground mb-4">Status breakdown across recorded shifts</p>
        <div className="h-[260px]">
          {attendance.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No attendance records yet</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={attendance}
                  dataKey="value"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={56}
                  outerRadius={88}
                  paddingAngle={2}
                >
                  {attendance.map((_, i) => (
                    <Cell key={i} fill={pieColors[i % pieColors.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltip} labelStyle={{ color: c.foreground }} itemStyle={{ color: c.foreground }} />
                <Legend wrapperStyle={{ fontSize: 11, color: c.axis }} formatter={(value) => <span style={{ color: c.axis }}>{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm p-4 shadow-sm">
        <p className="text-sm font-semibold text-foreground mb-1">Operations snapshot</p>
        <p className="text-xs text-muted-foreground mb-4">Directory size comparison</p>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={operations} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={tick} axisLine={axisLine} tickLine={axisLine} />
              <YAxis type="category" dataKey="label" tick={tickSm} axisLine={axisLine} tickLine={axisLine} width={72} />
              <Tooltip contentStyle={tooltip} labelStyle={{ color: c.foreground }} itemStyle={{ color: c.foreground }} />
              <Bar dataKey="value" fill={c.primary} radius={[0, 6, 6, 0]} barSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
