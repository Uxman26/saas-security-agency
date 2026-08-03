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
  'rgba(45, 212, 191, 0.2)',
  'rgba(224, 78, 0, 0.18)',
  'rgba(129, 140, 248, 0.18)',
  'rgba(74, 222, 128, 0.16)',
];

export function PatrolShowcase({ eyebrow, title, text, items, cta }: Props) {
  return (
    <section className="relative overflow-hidden border-b border-white/5 bg-[#0B0F14] py-20 md:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, black, transparent)',
        }}
      />
      <div className="container relative mx-auto px-4">
        <GsapReveal className="mx-auto mb-12 max-w-3xl text-center md:mb-14">
          <p data-reveal className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-teal-400/90">
            {eyebrow}
          </p>
          <h2 data-reveal className="text-3xl font-bold tracking-tight text-white md:text-5xl">
            {title}
          </h2>
          <p data-reveal className="mt-4 text-base leading-relaxed text-slate-400 md:text-lg">
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
                    <Icon className="mb-4 size-6 text-teal-300" />
                    <h3 className="text-base font-semibold text-white">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-400">{item.text}</p>
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
