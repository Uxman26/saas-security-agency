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

const TONES: Record<
  FeatureItem['tone'],
  { spot: string; shader: string; icon: string }
> = {
  ember: {
    spot: 'rgba(224, 78, 0, 0.22)',
    shader: 'from-[#3a1c0a] via-[#1a1410] to-[#0d1117]',
    icon: 'text-[#E8590C]',
  },
  slate: {
    spot: 'rgba(148, 163, 184, 0.2)',
    shader: 'from-[#1e293b] via-[#121820] to-[#0d1117]',
    icon: 'text-slate-300',
  },
  teal: {
    spot: 'rgba(45, 212, 191, 0.18)',
    shader: 'from-[#0f2f2c] via-[#121820] to-[#0d1117]',
    icon: 'text-teal-300',
  },
  forest: {
    spot: 'rgba(74, 222, 128, 0.16)',
    shader: 'from-[#14261a] via-[#121820] to-[#0d1117]',
    icon: 'text-emerald-300',
  },
  indigo: {
    spot: 'rgba(129, 140, 248, 0.18)',
    shader: 'from-[#1a1f3a] via-[#121820] to-[#0d1117]',
    icon: 'text-indigo-300',
  },
  steel: {
    spot: 'rgba(226, 232, 240, 0.14)',
    shader: 'from-[#243044] via-[#121820] to-[#0d1117]',
    icon: 'text-slate-200',
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
    <section className="relative overflow-hidden border-b border-white/5 bg-[#0B0F14] py-20 md:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 70% 50% at 50% -10%, rgba(224,78,0,0.12), transparent 55%), radial-gradient(ellipse 40% 40% at 90% 80%, rgba(45,212,191,0.06), transparent 50%)',
        }}
      />
      <div className="container relative mx-auto px-4">
        <GsapReveal className="mx-auto mb-12 max-w-3xl text-center md:mb-16">
          <p data-reveal className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[#E8590C]">
            {eyebrow}
          </p>
          <h2 data-reveal className="text-3xl font-bold tracking-tight text-white md:text-5xl">
            {title}
          </h2>
          <p data-reveal className="mt-4 text-base leading-relaxed text-slate-400 md:text-lg">
            {intro}
          </p>
        </GsapReveal>

        <GsapReveal className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5" stagger={0.1}>
          {features.map((f, i) => {
            const Icon = ICONS[i % ICONS.length];
            const tone = TONES[f.tone];
            return (
              <div key={f.title} data-reveal>
                <SpotlightCard spotlightColor={tone.spot} className="h-full min-h-[240px]">
                  <div
                    className={cn(
                      'flex h-full flex-col bg-gradient-to-br p-6 md:p-7',
                      tone.shader
                    )}
                  >
                    <div
                      className={cn(
                        'mb-5 flex size-11 items-center justify-center rounded-xl border border-white/10 bg-white/5',
                        tone.icon
                      )}
                    >
                      <Icon className="size-5" />
                    </div>
                    <h3 className="text-lg font-semibold text-white md:text-xl">{f.title}</h3>
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-slate-400">{f.text}</p>
                    <Link
                      href={f.href}
                      className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-200 transition-colors hover:text-white"
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
