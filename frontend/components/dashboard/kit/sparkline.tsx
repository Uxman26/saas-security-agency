import { useId } from 'react';

type Props = { data: number[]; className?: string; color?: string };

export function Sparkline({ data, className, color = 'var(--viz-1)' }: Props) {
  const id = useId();
  if (data.length < 2) return <div className={className} aria-hidden />;
  const w = 120;
  const h = 36;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 3 - ((v - min) / span) * (h - 6)]);
  const line = pts
    .map(([x, y], i) => {
      if (!i) return `M${x},${y}`;
      const [px, py] = pts[i - 1];
      const cx = (px + x) / 2;
      return `C${cx},${py} ${cx},${y} ${x},${y}`;
    })
    .join(' ');
  const flat = max === min;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {!flat && <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#${id})`} />}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        opacity={flat ? 0.45 : 1}
      />
    </svg>
  );
}
