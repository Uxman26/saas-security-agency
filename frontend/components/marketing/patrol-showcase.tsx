'use client';

import { QrCode, ScanLine, MapPinned, ClipboardCheck } from 'lucide-react';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { GsapReveal } from '@/components/marketing/gsap-reveal';
import { MarketingCta } from '@/components/marketing/marketing-cta';

type Props = {
  eyebrow: string;
  title: string;
  text: string;
  items: { title: string; text: string }[];
  cta: string;
};

const ICONS = [QrCode, ScanLine, MapPinned, ClipboardCheck];
const SPOTS = [
  'rgba(20, 184, 166, 0.12)',
  'rgba(224, 78, 0, 0.12)',
  'rgba(99, 102, 241, 0.1)',
  'rgba(34, 197, 94, 0.1)',
];

export function PatrolShowcase({ eyebrow, title, text, items, cta }: Props) {
  return (
    <section className="relative overflow-hidden border-b border-border/50 bg-background py-16 md:py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            'linear-gradient(rgba(22,30,44,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(22,30,44,0.04) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, black, transparent)',
        }}
      />
      <div className="container relative mx-auto px-4">
        <GsapReveal className="mx-auto mb-12 max-w-3xl text-center md:mb-14">
          <p data-reveal className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
            {eyebrow}
          </p>
          <h2 data-reveal className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            {title}
          </h2>
          <p data-reveal className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">
            {text}
          </p>
        </GsapReveal>

        <GsapReveal className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" stagger={0.09}>
          {items.map((item, i) => {
            const Icon = ICONS[i % ICONS.length];
            return (
              <div key={item.title} data-reveal>
                <SpotlightCard spotlightColor={SPOTS[i % SPOTS.length]} className="h-full">
                  <div className="flex h-full flex-col p-5 md:p-6">
                    <Icon className="mb-4 size-6 text-teal-700" />
                    <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
                  </div>
                </SpotlightCard>
              </div>
            );
          })}
        </GsapReveal>

        <GsapReveal className="mt-12 text-center">
          <div data-reveal>
            <MarketingCta href="/book-demo">{cta}</MarketingCta>
          </div>
        </GsapReveal>
      </div>
    </section>
  );
}
