'use client';

import Link from 'next/link';
import { Shield } from 'lucide-react';
import { BorderBeam } from '@/components/ui/border-beam';
import { BlurFade } from '@/components/ui/blur-fade';
import { cn } from '@/lib/utils';

type Pill = {
  href: string;
  label: string;
  value: React.ReactNode;
  /** Amber Mono tones + semantic present/absent. */
  tone: 'amber' | 'orange' | 'emerald' | 'red';
};

const TONE: Record<Pill['tone'], string> = {
  amber:
    'bg-primary/10 text-primary ring-primary/25 hover:bg-primary/15 dark:bg-primary/15 dark:text-primary dark:ring-primary/30',
  orange:
    'bg-orange-500/10 text-orange-800 ring-orange-500/25 hover:bg-orange-500/15 dark:text-orange-200 dark:ring-orange-400/30',
  emerald:
    'bg-emerald-500/10 text-emerald-800 ring-emerald-500/25 hover:bg-emerald-500/15 dark:text-emerald-200',
  red: 'bg-red-500/10 text-red-800 ring-red-500/25 hover:bg-red-500/15 dark:text-red-200',
};

type Props = {
  title: string;
  subtitle: string;
  description?: string;
  pills?: Pill[];
};

/** Command-centre hero — Amber Mono + Border Beam (21st.dev). */
export function DashboardHero({ title, subtitle, description, pills }: Props) {
  return (
    <BlurFade delay={0.04} inView>
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl border border-border/80 bg-card p-6 shadow-sm md:p-8',
          'dark:border-border dark:shadow-[0_0_0_1px_oklch(0.374_0.01_67.558/0.5)]'
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 70% 80% at 0% 0%, color-mix(in oklab, var(--primary) 14%, transparent), transparent 55%), radial-gradient(ellipse 45% 55% at 100% 100%, oklch(0.55 0.12 66 / 0.08), transparent 50%)',
          }}
        />
        <BorderBeam
          size={120}
          duration={10}
          colorFrom="#F45100"
          colorTo="#FF6A1F"
          borderWidth={1.5}
        />

        <div className="relative flex flex-wrap items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/25">
            <Shield className="size-6 text-primary" />
          </div>
          <div className="min-w-[200px] flex-1">
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl md:text-4xl">
              {title}
            </h1>
            <p className="mt-1.5 text-base font-semibold text-foreground/80 sm:text-lg">
              {subtitle}
            </p>
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>

          {pills && pills.length > 0 ? (
            <div className="flex flex-wrap gap-2 text-sm">
              {pills.map((p) => (
                <Link
                  key={p.label}
                  href={p.href}
                  className={cn(
                    'rounded-full px-3 py-1.5 ring-1 transition-colors',
                    TONE[p.tone]
                  )}
                >
                  <span className="font-medium opacity-90">{p.label}</span>{' '}
                  <strong className="tabular-nums">{p.value}</strong>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </BlurFade>
  );
}
