'use client';

import Link from 'next/link';
import { Shield } from 'lucide-react';
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
  amber: 'bg-brand-50 text-brand-700 ring-brand-200/70 hover:bg-brand-100 dark:text-brand-700',
  orange: 'bg-warning-soft text-warning ring-warning/20 hover:brightness-95',
  emerald: 'bg-success-soft text-success ring-success/20 hover:brightness-95',
  red: 'bg-danger-soft text-danger ring-danger/20 hover:brightness-95',
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
      <div className="dash-card relative overflow-hidden p-6 md:p-7">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_90%_at_0%_0%,color-mix(in_oklab,var(--primary)_10%,transparent),transparent_60%)]"
        />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-xl bg-brand-50 ring-1 ring-brand-200/60 dark:ring-brand-300/30">
            <Shield className="size-6 text-primary" />
          </div>
          <div className="min-w-[200px] flex-1">
            <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-[2rem]">
              {title}
            </h1>
            <p className="mt-1 text-[15px] font-medium text-foreground/80">
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
                    'rounded-full px-3 py-1.5 text-[13px] ring-1 transition-[filter,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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
