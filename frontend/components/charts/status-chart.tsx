'use client';

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useVizColors, type VizColors } from '@/lib/dashboard/viz';
import { fmtNum, fmtPct } from '@/lib/dashboard/format';

export type ChartDatum = { name: string; value: number; color?: string };

const ORDER = ['viz-1', 'viz-3', 'viz-2', 'viz-late', 'viz-ontime', 'viz-absent'] as const;
const colorAt = (c: VizColors, d: ChartDatum, i: number) => d.color || (i < ORDER.length ? c[ORDER[i]] : c['viz-neutral']);

function Frame({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="dash-card p-5 sm:p-6">
      {title ? <h3 className="mb-4 text-[15px] font-semibold tracking-tight">{title}</h3> : null}
      {children}
    </section>
  );
}

function Tip({ name, value, total }: { name: string; value: number; total: number }) {
  return (
    <div className="rounded-lg bg-popover px-3 py-2 text-xs shadow-pop ring-1 ring-hairline">
      <span className="font-semibold">{name}</span>
      <span className="ms-3 tabular-nums">
        {fmtNum(value)} · {fmtPct((value / total) * 100)}
      </span>
    </div>
  );
}

export function StatusPieChart({ data, title }: { data: ChartDatum[]; title?: string }) {
  const c = useVizColors();
  const rows = data.filter((d) => d.value > 0);
  if (rows.length === 0) return null;
  const total = rows.reduce((a, d) => a + d.value, 0);

  return (
    <Frame title={title}>
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
        <figure className="relative aspect-square w-full max-w-[200px] shrink-0" role="img" aria-label={`${title ?? ''}: ${rows.map((r) => `${r.name} ${r.value}`).join(', ')}`}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={rows}
                dataKey="value"
                nameKey="name"
                innerRadius="72%"
                outerRadius="100%"
                paddingAngle={rows.length > 1 ? 2 : 0}
                cornerRadius={4}
                stroke={c.surface}
                strokeWidth={2}
                startAngle={90}
                endAngle={-270}
                animationDuration={900}
              >
                {rows.map((d, i) => (
                  <Cell key={d.name} fill={colorAt(c, d, i)} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  const p = payload?.[0]?.payload as ChartDatum | undefined;
                  return active && p ? <Tip name={p.name} value={p.value} total={total} /> : null;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <figcaption className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-semibold tabular-nums tracking-tight">{fmtNum(total)}</span>
            <span className="text-[11px] text-muted-foreground">Total</span>
          </figcaption>
        </figure>
        <ul className="w-full min-w-0 flex-1 space-y-1.5">
          {rows.map((d, i) => (
            <li key={d.name} className="flex items-center gap-2.5 rounded-md px-1.5 py-1 text-[13px]">
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: colorAt(c, d, i) }} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{d.name}</span>
              <span className="font-medium tabular-nums">{fmtNum(d.value)}</span>
              <span className="w-12 text-end text-xs tabular-nums text-muted-foreground">{fmtPct((d.value / total) * 100)}</span>
            </li>
          ))}
        </ul>
      </div>
    </Frame>
  );
}

export function StatusBarChart({ data, title }: { data: ChartDatum[]; title?: string }) {
  const c = useVizColors();
  const rows = data.filter((d) => d.value > 0);
  if (rows.length === 0) return null;
  const total = rows.reduce((a, d) => a + d.value, 0);
  const tick = { fontSize: 11, fill: c['muted-foreground'] };

  return (
    <Frame title={title}>
      <figure className="h-[220px]" role="img" aria-label={`${title ?? ''}: ${rows.map((r) => `${r.name} ${r.value}`).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="28%">
            <CartesianGrid stroke={c.hairline} vertical={false} />
            <XAxis dataKey="name" tick={tick} axisLine={false} tickLine={false} interval={0} minTickGap={4} />
            <YAxis allowDecimals={false} tick={tick} axisLine={false} tickLine={false} width={32} />
            <Tooltip
              cursor={{ fill: c['viz-faint'], fillOpacity: 0.5 }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as ChartDatum | undefined;
                return active && p ? <Tip name={p.name} value={p.value} total={total} /> : null;
              }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={40} animationDuration={800}>
              {rows.map((d, i) => (
                <Cell key={d.name} fill={colorAt(c, d, i)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </figure>
    </Frame>
  );
}
