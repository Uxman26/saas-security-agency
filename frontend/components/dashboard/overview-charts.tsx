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

const CHART = {
  grid: 'hsl(var(--border) / 0.4)',
  axis: 'hsl(var(--muted-foreground))',
  primary: 'hsl(217 91% 60%)',
  accent: 'hsl(187 85% 43%)',
  warn: 'hsl(38 92% 50%)',
  danger: 'hsl(0 72% 51%)',
  muted: 'hsl(215 20% 65%)',
};

const PIE_COLORS = [CHART.primary, CHART.accent, CHART.warn, CHART.danger, CHART.muted];

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
  const shiftData = shifts.map((p) => ({ ...p, day: fmtDay(p.label) }));

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
                  <stop offset="0%" stopColor={CHART.primary} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={CHART.primary} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: CHART.axis }} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: CHART.axis }} width={28} />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelFormatter={(_, payload) => {
                  const row = payload?.[0]?.payload as { label?: string } | undefined;
                  return row?.label ? fmtDay(row.label) : '';
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                name="Shifts"
                stroke={CHART.primary}
                fill="url(#shiftFill)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, fill: CHART.accent }}
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
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: CHART.axis }} />
              <YAxis tick={{ fontSize: 10, fill: CHART.axis }} width={40} tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(v) => [`£${Number(v ?? 0).toLocaleString('en-GB')}`, 'Payroll']}
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="value" name="Payroll" fill={CHART.accent} radius={[6, 6, 0, 0]} maxBarSize={48} />
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
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
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
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: CHART.axis }} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: CHART.axis }} width={72} />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="value" fill={CHART.primary} radius={[0, 6, 6, 0]} barSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
