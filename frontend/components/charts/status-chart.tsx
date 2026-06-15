'use client';

import {
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
import { axisLineProps, chartTooltipStyle, tickProps, useChartTheme } from '@/lib/chart-theme';

export type ChartDatum = { name: string; value: number; color?: string };

export function StatusPieChart({ data, title }: { data: ChartDatum[]; title?: string }) {
  const c = useChartTheme();
  const rows = data.filter((d) => d.value > 0);
  if (rows.length === 0) return null;
  const palette = [c.primary, c.accent, c.warn, c.danger, c.muted];
  const tooltip = chartTooltipStyle(c);

  return (
    <div className="rounded-xl border border-border/60 bg-card/80 p-4">
      {title && <p className="text-sm font-semibold mb-3">{title}</p>}
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={78} paddingAngle={2}>
              {rows.map((d, i) => (
                <Cell key={d.name} fill={d.color || palette[i % palette.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function StatusBarChart({ data, title }: { data: ChartDatum[]; title?: string }) {
  const c = useChartTheme();
  const rows = data.filter((d) => d.value > 0);
  if (rows.length === 0) return null;
  const palette = [c.primary, c.accent, c.warn, c.danger, c.muted];
  const tooltip = chartTooltipStyle(c);
  const tick = tickProps(c);
  const axisLine = axisLineProps(c);

  return (
    <div className="rounded-xl border border-border/60 bg-card/80 p-4">
      {title && <p className="text-sm font-semibold mb-3">{title}</p>}
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
            <XAxis dataKey="name" tick={tick} axisLine={axisLine} tickLine={axisLine} />
            <YAxis allowDecimals={false} tick={tick} axisLine={axisLine} tickLine={axisLine} width={32} />
            <Tooltip contentStyle={tooltip} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {rows.map((d, i) => (
                <Cell key={d.name} fill={d.color || palette[i % palette.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
