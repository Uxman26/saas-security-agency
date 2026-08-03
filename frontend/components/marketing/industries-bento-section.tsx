'use client';

import {
  Shield,
  Sparkles,
  CalendarDays,
  Users,
  Building2,
  type LucideIcon,
} from 'lucide-react';
import { BentoCard, BentoGrid } from '@/components/ui/bento-grid';
import { BlurFade } from '@/components/ui/blur-fade';
import { TextAnimate } from '@/components/ui/text-animate';
import { Marquee } from '@/components/ui/marquee';
import { RichInline } from '@/components/marketing/marketing-rich-text';
import { cn } from '@/lib/utils';

export type IndustryItem = {
  title: string;
  text: string;
  href: string;
  cta: string;
};

type Props = {
  title: string;
  intro: string;
  industries: IndustryItem[];
};

const ICONS: LucideIcon[] = [Shield, Sparkles, CalendarDays, Users, Building2];

const LAYOUT = [
  'lg:col-span-2',
  'lg:col-span-1',
  'lg:col-span-1',
  'lg:col-span-2',
  'lg:col-span-3',
];

const TICKERS = [
  'Guards',
  'Sites',
  'Rotas',
  'SIA',
  'Patrol',
  'Payroll',
  'Invoices',
  'Coverage',
];

function IndustryBackdrop({ index }: { index: number }) {
  if (index === 0) {
    return (
      <div className="absolute inset-0 overflow-hidden">
        <div
          aria-hidden
          className="absolute -end-8 -top-10 size-56 rounded-full blur-3xl"
          style={{ background: 'rgba(224,78,0,0.18)' }}
        />
        <div className="absolute inset-x-0 bottom-0 opacity-40 [mask-image:linear-gradient(to_top,white,transparent)]">
          <Marquee pauseOnHover className="[--duration:28s]">
            {TICKERS.map((t) => (
              <span
                key={t}
                className="mx-2 rounded-full border border-border/70 bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm dark:border-white/10 dark:bg-white/5"
              >
                {t}
              </span>
            ))}
          </Marquee>
        </div>
      </div>
    );
  }

  const glows = [
    'rgba(224,78,0,0.14)',
    'rgba(245,158,11,0.12)',
    'rgba(234,88,12,0.12)',
    'rgba(251,146,60,0.14)',
  ];

  return (
    <div
      aria-hidden
      className="absolute inset-0"
      style={{
        background: `radial-gradient(ellipse 70% 60% at ${index % 2 === 0 ? '90%' : '10%'} 10%, ${glows[index % glows.length]}, transparent 60%)`,
      }}
    />
  );
}

export function IndustriesBentoSection({ title, intro, industries }: Props) {
  const items = industries.slice(0, 4);

  return (
    <section className="relative overflow-hidden border-b border-border/50 bg-background py-16 md:py-24">
      <div className="container relative mx-auto px-4">
        <BlurFade delay={0.05} inView className="mb-10 max-w-3xl md:mb-12">
          <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            <RichInline text={title} variant="hero" />
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            <RichInline text={intro} />
          </p>
        </BlurFade>

        <BlurFade delay={0.15} inView>
          <BentoGrid className="auto-rows-[20rem] lg:auto-rows-[22rem]">
            {items.map((ind, i) => {
              const Icon = ICONS[i % ICONS.length];
              return (
                <BentoCard
                  key={ind.title}
                  name={ind.title}
                  className={cn(LAYOUT[i] ?? 'lg:col-span-1')}
                  Icon={Icon}
                  description={<RichInline text={ind.text} />}
                  href={ind.href}
                  cta={ind.cta}
                  background={<IndustryBackdrop index={i} />}
                />
              );
            })}
          </BentoGrid>
        </BlurFade>
      </div>
    </section>
  );
}
