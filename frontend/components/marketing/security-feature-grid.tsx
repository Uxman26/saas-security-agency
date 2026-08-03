'use client';

import Link from 'next/link';
import {
  Shield,
  MapPin,
  CalendarDays,
  QrCode,
  AlertTriangle,
  Wallet,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { GsapReveal } from '@/components/marketing/gsap-reveal';
import { cn } from '@/lib/utils';

export type FeatureItem = {
  title: string;
  text: string;
  href: string;
  tone: 'ember' | 'slate' | 'teal' | 'forest' | 'indigo' | 'steel';
};

const ICONS: LucideIcon[] = [Shield, MapPin, CalendarDays, QrCode, AlertTriangle, Wallet];

const TONES: Record<FeatureItem['tone'], { spot: string; shader: string; icon: string }> = {
  ember: {
    spot: 'rgba(224, 78, 0, 0.14)',
    shader: 'from-orange-50 via-card to-card dark:from-orange-950/40 dark:via-card dark:to-card',
    icon: 'text-primary',
  },
  slate: {
    spot: 'rgba(100, 116, 139, 0.12)',
    shader: 'from-slate-50 via-card to-card dark:from-slate-900/50 dark:via-card dark:to-card',
    icon: 'text-slate-600 dark:text-slate-300',
  },
  teal: {
    spot: 'rgba(20, 184, 166, 0.12)',
    shader: 'from-teal-50 via-card to-card dark:from-teal-950/40 dark:via-card dark:to-card',
    icon: 'text-teal-700 dark:text-teal-300',
  },
  forest: {
    spot: 'rgba(34, 197, 94, 0.12)',
    shader: 'from-emerald-50 via-card to-card dark:from-emerald-950/40 dark:via-card dark:to-card',
    icon: 'text-emerald-700 dark:text-emerald-300',
  },
  indigo: {
    spot: 'rgba(99, 102, 241, 0.12)',
    shader: 'from-indigo-50 via-card to-card dark:from-indigo-950/40 dark:via-card dark:to-card',
    icon: 'text-indigo-700 dark:text-indigo-300',
  },
  steel: {
    spot: 'rgba(71, 85, 105, 0.1)',
    shader: 'from-muted/80 via-card to-card',
    icon: 'text-foreground',
  },
};

type Props = {
  eyebrow: string;
  title: string;
  intro: string;
  features: FeatureItem[];
  learnMore: string;
};

export function SecurityFeatureGrid({ eyebrow, title, intro, features, learnMore }: Props) {
  return (
    <section className="relative overflow-hidden border-b border-border/50 bg-background py-16 md:py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 70% 50% at 50% -10%, rgba(224,78,0,0.05), transparent 55%)',
        }}
      />
      <div className="container relative mx-auto px-4">
        <GsapReveal className="mx-auto mb-12 max-w-3xl text-center md:mb-14">
          <p
            data-reveal
            className="mb-4 text-xs font-semibold uppercase tracking-[0.2em]"
            style={{ color: '#E04E00' }}
          >
            {eyebrow}
          </p>
          <h2 data-reveal className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            {title}
          </h2>
          <p data-reveal className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">
            {intro}
          </p>
        </GsapReveal>

        <GsapReveal className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5" stagger={0.1}>
          {features.map((f, i) => {
            const Icon = ICONS[i % ICONS.length];
            const tone = TONES[f.tone];
            return (
              <div key={f.title} data-reveal>
                <SpotlightCard spotlightColor={tone.spot} className="h-full min-h-[220px]">
                  <div className={cn('flex h-full flex-col bg-gradient-to-br p-6 md:p-7', tone.shader)}>
                    <div
                      className={cn(
                        'mb-5 flex size-11 items-center justify-center rounded-xl border border-border bg-background shadow-sm',
                        tone.icon
                      )}
                    >
                      <Icon className="size-5" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground md:text-xl">{f.title}</h3>
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{f.text}</p>
                    <Link
                      href={f.href}
                      className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-foreground transition-colors hover:text-primary"
                    >
                      {learnMore}
                      <ArrowRight className="size-3.5 rtl:rotate-180" />
                    </Link>
                  </div>
                </SpotlightCard>
              </div>
            );
          })}
        </GsapReveal>
      </div>
    </section>
  );
}
