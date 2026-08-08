'use client';

import { useRef, useState, type MouseEvent } from 'react';
import { motion, useMotionTemplate, useMotionValue, useSpring } from 'motion/react';
import {
  AlertTriangle,
  Calendar,
  MapPin,
  Shield,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BorderBeam } from '@/components/ui/border-beam';
import { NumberTicker } from '@/components/ui/number-ticker';

type ShiftRow = {
  site: string;
  time: string;
  staff: string;
  status: 'On site' | 'Confirmed' | 'En route';
};

const SHIFTS: ShiftRow[] = [
  { site: 'City Centre — Night cover', time: '18:00–06:00', staff: 'James K.', status: 'On site' },
  { site: 'Retail Park — Day shift', time: '08:00–17:00', staff: 'Sarah M.', status: 'Confirmed' },
  { site: 'Office Block — Reception', time: '09:00–18:00', staff: 'Ahmed R.', status: 'En route' },
];

const STATUS_STYLE: Record<ShiftRow['status'], string> = {
  'On site': 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  Confirmed: 'bg-orange-500/15 text-orange-800 dark:text-orange-300',
  'En route': 'bg-sky-500/15 text-sky-800 dark:text-sky-300',
};

/**
 * Interactive 3D ops dashboard card (21st.dev analytics-card pattern).
 * Mouse-tilt perspective + live ControlOps shift preview — replaces abstract globe.
 */
export function Ops3dDashboard({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);

  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springX = useSpring(rotateX, { stiffness: 180, damping: 22 });
  const springY = useSpring(rotateY, { stiffness: 180, damping: 22 });
  const transform = useMotionTemplate`perspective(1200px) rotateX(${springX}deg) rotateY(${springY}deg)`;

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    rotateX.set((0.5 - py) * 14);
    rotateY.set((px - 0.5) * 18);
  };

  const onLeave = () => {
    setHovered(false);
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <div className={cn('relative w-full max-w-[540px]', className)}>
      {/* Depth glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-8 rounded-[2rem] opacity-70 blur-3xl"
        style={{
          background:
            'radial-gradient(ellipse 70% 60% at 50% 40%, color-mix(in oklab, #E04E00 22%, transparent), transparent 70%)',
        }}
      />

      {/* Floating satellite chips */}
      <motion.div
        className="absolute -left-2 top-6 z-20 hidden rounded-full border border-border/70 bg-card/90 px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur-md sm:flex sm:items-center sm:gap-2 dark:bg-[#12151a]/90"
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <MapPin className="size-3.5 text-[#E04E00]" />
        <span>36 sites live</span>
      </motion.div>
      <motion.div
        className="absolute -right-1 bottom-16 z-20 hidden rounded-full border border-border/70 bg-card/90 px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur-md sm:flex sm:items-center sm:gap-2 dark:bg-[#12151a]/90"
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 5.2, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
      >
        <Shield className="size-3.5 text-[#FD8018]" />
        <span>Coverage OK</span>
      </motion.div>

      <motion.div
        ref={ref}
        style={{ transform, transformStyle: 'preserve-3d' }}
        onMouseMove={onMove}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={onLeave}
        className={cn(
          'relative overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xl shadow-black/10',
          'dark:border-white/10 dark:bg-[#0F1318] dark:shadow-black/50',
          hovered && 'ring-1 ring-[#E04E00]/35'
        )}
      >
        <BorderBeam size={140} duration={10} colorFrom="#E04E00" colorTo="#FDBA74" borderWidth={1.25} />

        {/* Window chrome */}
        <div className="flex items-center justify-between border-b border-border/60 bg-[#0B0F14] px-4 py-3 dark:border-white/10">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-red-400/90" />
            <span className="size-2.5 rounded-full bg-amber-400/90" />
            <span className="size-2.5 rounded-full bg-emerald-400/90" />
          </div>
          <p className="text-[11px] font-medium tracking-wide text-white/75">ControlOps · Live ops</p>
          <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
            Live
          </div>
        </div>

        <div className="space-y-4 p-4 sm:p-5" style={{ transform: 'translateZ(24px)' }}>
          {/* KPIs */}
          <div className="grid grid-cols-3 gap-2.5">
            <Kpi icon={Calendar} label="Shifts today" value={42} />
            <Kpi icon={Users} label="On duty" value={128} />
            <Kpi icon={AlertTriangle} label="Alerts" value={7} warn />
          </div>

          {/* Mini chart */}
          <div className="rounded-xl border border-border/60 bg-muted/30 p-3 dark:bg-white/[0.03]">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Shift volume · 14 days
              </p>
              <p className="text-[10px] font-medium text-[#E04E00]">+12%</p>
            </div>
            <MiniBars />
          </div>

          {/* Shift rows */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Today&apos;s cover
            </p>
            {SHIFTS.map((row) => (
              <div
                key={row.site}
                className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/60 px-3 py-2 dark:bg-white/[0.03]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">{row.site}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {row.time} · {row.staff}
                  </p>
                </div>
                <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold', STATUS_STYLE[row.status])}>
                  {row.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  warn,
}: {
  icon: typeof Calendar;
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-2.5 shadow-sm',
        warn ? 'border-amber-500/30 bg-amber-500/5' : 'border-border/60 bg-background/70 dark:bg-white/[0.03]'
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-1">
        <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon className={cn('size-3.5', warn ? 'text-amber-500' : 'text-muted-foreground')} />
      </div>
      <NumberTicker
        value={value}
        className={cn('text-lg font-bold tabular-nums', warn ? 'text-amber-700 dark:text-amber-300' : 'text-foreground')}
      />
    </div>
  );
}

function MiniBars() {
  const bars = [38, 52, 45, 68, 58, 72, 64, 80, 74, 88, 82, 94, 86, 96];
  return (
    <div className="flex h-16 items-end gap-1">
      {bars.map((h, i) => (
        <motion.div
          key={i}
          className={cn(
            'flex-1 rounded-t-sm',
            i === bars.length - 1 ? 'bg-[#E04E00]' : 'bg-foreground/25 dark:bg-white/25'
          )}
          initial={{ height: 0 }}
          animate={{ height: `${h}%` }}
          transition={{ duration: 0.7, delay: 0.05 * i, ease: 'easeOut' }}
          style={{ opacity: 0.4 + (i / bars.length) * 0.6 }}
        />
      ))}
    </div>
  );
}

export default Ops3dDashboard;
