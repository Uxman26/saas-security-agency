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
import { MagicCard } from '@/components/ui/magic-card';
import { BlurFade } from '@/components/ui/blur-fade';

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

function ChartShell({
  title,
  subtitle,
  children,
  delay = 0,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <BlurFade delay={delay} inView>
      <MagicCard
        className="h-full rounded-2xl"
        gradientSize={280}
        gradientFrom="#F45100"
        gradientTo="#FF6A1F"
        gradientColor="rgba(224,78,0,0.08)"
        gradientOpacity={0.5}
      >
        <div className="p-4 sm:p-5">
          <p className="mb-0.5 text-sm font-semibold text-foreground">{title}</p>
          <p className="mb-4 text-xs text-muted-foreground">{subtitle}</p>
          <div className="h-[240px] sm:h-[260px]">{children}</div>
        </div>
      </MagicCard>
    </BlurFade>
  );
}

export function OverviewCharts({ shifts, attendance, payroll, operations }: Props) {
  const c = useChartTheme();
  const pieColors = [c.primary, c.accent, c.warn, c.danger, c.muted]; // Amber Mono chart-1…5
  const shiftData = shifts.map((p) => ({ ...p, day: fmtDay(p.label) }));
  const tooltip = chartTooltipStyle(c);
  const tick = tickProps(c);
  const tickSm = tickProps(c, 11);
  const axisLine = axisLineProps(c);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartShell title="Shift volume" subtitle="Last 14 days and next 7 days" delay={0.08}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={shiftData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="shiftFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c.primary} stopOpacity={0.35} />
                <stop offset="100%" stopColor={c.primary} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
            <XAxis
              dataKey="day"
              tick={tick}
              axisLine={axisLine}
              tickLine={axisLine}
              interval="preserveStartEnd"
            />
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
      </ChartShell>

      <ChartShell title="Payroll by month" subtitle="Bank + cash totals (6 months)" delay={0.12}>
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
      </ChartShell>

      <ChartShell title="Attendance (30 days)" subtitle="Status breakdown across recorded shifts" delay={0.16}>
        {attendance.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No attendance records yet
          </div>
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
              <Tooltip
                contentStyle={tooltip}
                labelStyle={{ color: c.foreground }}
                itemStyle={{ color: c.foreground }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: c.axis }}
                formatter={(value) => <span style={{ color: c.axis }}>{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </ChartShell>

      <ChartShell title="Operations snapshot" subtitle="Directory size comparison" delay={0.2}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={operations} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={c.grid} horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={tick} axisLine={axisLine} tickLine={axisLine} />
            <YAxis
              type="category"
              dataKey="label"
              tick={tickSm}
              axisLine={axisLine}
              tickLine={axisLine}
              width={72}
            />
            <Tooltip
              contentStyle={tooltip}
              labelStyle={{ color: c.foreground }}
              itemStyle={{ color: c.foreground }}
            />
            <Bar dataKey="value" fill={c.primary} radius={[0, 6, 6, 0]} barSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </ChartShell>
    </div>
  );
}
