import { cn } from '@/lib/utils';

type Stat = { value: string; label: string; desc: string };

export function MarketingStatsStrip({ items, className }: { items: Stat[]; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 lg:grid-cols-4 gap-4', className)}>
      {items.map((s) => (
        <div
          key={s.label}
          className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-card to-primary/5 p-5 shadow-sm"
        >
          <div className="absolute top-0 end-0 size-20 rounded-full bg-primary/10 blur-2xl -translate-y-1/2 translate-x-1/2" />
          <p className="text-3xl md:text-4xl font-bold marketing-gradient-text tabular-nums">{s.value}</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{s.label}</p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
        </div>
      ))}
    </div>
  );
}
