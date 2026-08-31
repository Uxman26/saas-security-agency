'use client';

import { QrCode, ScanLine, MapPinned, ClipboardCheck } from 'lucide-react';
import { MagicCard } from '@/components/ui/magic-card';
import { BlurFade } from '@/components/ui/blur-fade';
import { AnimatedGradientText } from '@/components/ui/animated-gradient-text';
import { TextAnimate } from '@/components/ui/text-animate';
import { MarketingCta } from '@/components/marketing/marketing-cta';

type Props = {
  eyebrow: string;
  title: string;
  text: string;
  items: { title: string; text: string }[];
  cta: string;
};

const ICONS = [QrCode, ScanLine, MapPinned, ClipboardCheck];

export function PatrolShowcase({ eyebrow, title, text, items, cta }: Props) {
  return (
    <section className="relative overflow-hidden border-b border-border/50 bg-background py-16 md:py-24 dark:bg-[#0F172A]">
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
        <div className="mx-auto mb-12 max-w-3xl text-center md:mb-14">
          <BlurFade delay={0.05} inView>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em]">
              <AnimatedGradientText
                colorFrom="#F45100"
                colorTo="#F59E0B"
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
            <p className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">{text}</p>
          </BlurFade>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item, i) => {
            const Icon = ICONS[i % ICONS.length];
            return (
              <BlurFade key={item.title} delay={0.12 + i * 0.08} inView>
                <MagicCard
                  className="h-full rounded-2xl"
                  gradientFrom="#F45100"
                  gradientTo="#F59E0B"
                  gradientColor="rgba(224,78,0,0.1)"
                  gradientOpacity={0.55}
                  gradientSize={220}
                >
                  <div className="flex h-full flex-col p-5 md:p-6">
                    <Icon className="mb-4 size-6 text-orange-700 dark:text-orange-400" />
                    <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
                  </div>
                </MagicCard>
              </BlurFade>
            );
          })}
        </div>

        <BlurFade delay={0.5} inView className="mt-12 text-center">
          <MarketingCta href="/book-demo">{cta}</MarketingCta>
        </BlurFade>
      </div>
    </section>
  );
}
