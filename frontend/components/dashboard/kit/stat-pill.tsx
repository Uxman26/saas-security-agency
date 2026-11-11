'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CountUp } from './count-up';
import { fmtNum } from '@/lib/dashboard/format';
import { TONE_CHIP, type Tone } from './kpi-card';

type Props = { label: string; value: number; icon: LucideIcon; href: string; tone: Tone; live?: boolean; emphasise?: boolean };

export function StatPill({ label, value, icon: Icon, href, tone, live, emphasise }: Props) {
  return (
    <Link
      href={href}
      aria-label={`${label}: ${value}`}
      className={cn(
        'group/pill flex min-w-[10.5rem] flex-1 items-center gap-3 rounded-xl px-3.5 py-3 outline-none transition-colors',
        'hover:bg-foreground/[0.035] focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/[0.04]'
      )}
    >
      <span className={cn('relative flex size-9 shrink-0 items-center justify-center rounded-lg ring-1', TONE_CHIP[tone])}>
        <Icon className="size-4" aria-hidden />
        {live && value > 0 ? (
          <span className="absolute -end-0.5 -top-0.5 flex size-2.5">
            <span className={cn('dash-live-dot relative inline-flex size-2.5 rounded-full ring-2 ring-surface', emphasise ? 'text-danger bg-danger' : 'text-success bg-success')} />
          </span>
        ) : null}
      </span>
      <span className="min-w-0">
        <CountUp
          value={value}
          format={fmtNum}
          className={cn('block text-lg font-semibold leading-tight tabular-nums', emphasise && value > 0 ? 'text-danger' : 'text-foreground')}
        />
        <span className="block truncate text-xs text-muted-foreground group-hover/pill:text-foreground">{label}</span>
      </span>
    </Link>
  );
}
