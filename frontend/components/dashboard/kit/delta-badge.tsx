import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { delta } from '@/lib/dashboard/format';

type Props = {
  value: number;
  previous: number | null | undefined;
  goodWhen?: 'up' | 'down';
  unit?: 'count' | 'pct' | 'pts';
  label: string;
};

export function DeltaBadge({ value, previous, goodWhen = 'up', unit = 'pct', label }: Props) {
  const d = delta(value, previous);
  if (!d) return null;
  const good = d.dir === 'flat' ? null : (d.dir === goodWhen);
  const Icon = d.dir === 'up' ? ArrowUpRight : d.dir === 'down' ? ArrowDownRight : Minus;
  const text =
    unit === 'count'
      ? `${d.diff > 0 ? '+' : ''}${Math.round(d.diff)}`
      : unit === 'pts' || d.pct == null
        ? `${d.diff > 0 ? '+' : ''}${Math.round(d.diff * 10) / 10}${unit === 'pts' ? ' pts' : ''}`
        : `${d.pct > 0 ? '+' : ''}${Math.round(d.pct)}%`;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums leading-none',
        good === null && 'bg-muted text-muted-foreground',
        good === true && 'bg-success-soft text-success',
        good === false && 'bg-danger-soft text-danger'
      )}
      title={label}
    >
      <Icon className="size-3" aria-hidden />
      {text}
      <span className="sr-only"> {label}</span>
    </span>
  );
}
