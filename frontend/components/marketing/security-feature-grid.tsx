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
import { BlurFade } from '@/components/ui/blur-fade';
import { AnimatedGradientText } from '@/components/ui/animated-gradient-text';
import { TextAnimate } from '@/components/ui/text-animate';
import { ShineBorder } from '@/components/ui/shine-border';
import { cn } from '@/lib/utils';

export type FeatureItem = {
  title: string;
  text: string;
  href: string;
  tone: 'ember' | 'slate' | 'teal' | 'forest' | 'amber' | 'steel';
};

const ICONS: LucideIcon[] = [Shield, MapPin, CalendarDays, QrCode, AlertTriangle, Wallet];

const TONES: Record<FeatureItem['tone'], { spot: string; shader: string; icon: string }> = {
  ember: {
    spot: 'rgba(224, 78, 0, 0.14)',
    shader:
      'from-orange-50/80 via-muted/40 to-muted/30 dark:from-[#12151a] dark:via-[#0F172A] dark:to-[#0F172A]',
    icon: 'text-primary',
  },
  slate: {
    spot: 'rgba(120, 113, 108, 0.12)',
    shader:
      'from-stone-50/80 via-muted/40 to-muted/30 dark:from-[#12151a] dark:via-[#0F172A] dark:to-[#0F172A]',
    icon: 'text-stone-600 dark:text-stone-300',
  },
  teal: {
    spot: 'rgba(16, 185, 129, 0.12)',
    shader:
      'from-emerald-50/80 via-muted/40 to-muted/30 dark:from-[#101612] dark:via-[#0F172A] dark:to-[#0F172A]',
    icon: 'text-emerald-700 dark:text-emerald-300',
  },
  forest: {
    spot: 'rgba(34, 197, 94, 0.12)',
    shader:
      'from-emerald-50/80 via-muted/40 to-muted/30 dark:from-[#101612] dark:via-[#0F172A] dark:to-[#0F172A]',
    icon: 'text-emerald-700 dark:text-emerald-300',
  },
  amber: {
    spot: 'rgba(245, 158, 11, 0.14)',
    shader:
      'from-amber-50/80 via-muted/40 to-muted/30 dark:from-[#14110c] dark:via-[#0F172A] dark:to-[#0F172A]',
    icon: 'text-amber-700 dark:text-amber-300',
  },
  steel: {
    spot: 'rgba(120, 113, 108, 0.1)',
    shader: 'from-muted/60 via-muted/40 to-muted/30 dark:from-[#12151a] dark:via-[#0F172A] dark:to-[#0F172A]',
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
    <section className="relative overflow-hidden border-b border-border/50 bg-background py-16 md:py-24 dark:bg-[#0F172A]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 70% 50% at 50% -10%, rgba(224,78,0,0.05), transparent 55%)',
        }}
      />
      <div className="container relative mx-auto px-4">
        <div className="mx-auto mb-12 max-w-3xl text-center md:mb-14">
          <BlurFade delay={0.05} inView>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em]">
              <AnimatedGradientText
                colorFrom="#F45100"
                colorTo="#F97316"
                speed={1.2}
                className="font-semibold uppercase tracking-[0.2em]"
              >
                {eyebrow}
              </AnimatedGradientText>
            </p>
          </BlurFade>
          <BlurFade delay={0.12} inView>
            <TextAnimate
              as="h2"
              by="word"
              animation="blurInUp"
              startOnView
              once
              className="text-3xl font-bold tracking-tight text-foreground md:text-4xl"
            >
              {title}
            </TextAnimate>
          </BlurFade>
          <BlurFade delay={0.22} inView>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">{intro}</p>
          </BlurFade>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {features.map((f, i) => {
            const Icon = ICONS[i % ICONS.length];
            const tone = TONES[f.tone];
            return (
              <BlurFade key={f.title} delay={0.1 + i * 0.08} inView>
                <SpotlightCard spotlightColor={tone.spot} className="h-full min-h-[220px]">
                  {i === 0 && (
                    <ShineBorder
                      borderWidth={1}
                      duration={12}
                      shineColor={['#F45100', '#FDBA74', '#F45100']}
                    />
                  )}
                  <div className={cn('flex h-full flex-col bg-gradient-to-br p-6 md:p-7', tone.shader)}>
                    <div
                      className={cn(
                        'mb-5 flex size-11 items-center justify-center rounded-xl border border-border bg-background/80 shadow-sm dark:border-white/10 dark:bg-[#11161D]',
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
              </BlurFade>
            );
          })}
        </div>
      </div>
    </section>
  );
}
