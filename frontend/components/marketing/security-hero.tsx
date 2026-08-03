'use client';

import Link from 'next/link';
import type { COBEOptions } from 'cobe';
import { Button } from '@/components/ui/button';
import { Globe } from '@/components/ui/globe';
import { BlurFade } from '@/components/ui/blur-fade';
import { AnimatedGradientText } from '@/components/ui/animated-gradient-text';
import { NumberTicker } from '@/components/ui/number-ticker';
import { Ripple } from '@/components/ui/ripple';
import { MarketingCta } from '@/components/marketing/marketing-cta';

type Stat = { value: string; label: string };

type Props = {
  status: string;
  titleLead: string;
  titleAccent: string;
  text: string;
  stats: Stat[];
  primaryCta: string;
  secondaryCta: string;
};

/** ControlOps markers — UK + key ops cities (orange accent). */
const CONTROL_OPS_GLOBE = {
  width: 1000,
  height: 1000,
  onRender: () => {},
  devicePixelRatio: 2,
  phi: 0,
  theta: 0.28,
  dark: 0,
  diffuse: 1.2,
  mapSamples: 16000,
  mapBrightness: 8,
  mapBaseBrightness: 0.08,
  baseColor: [0.94, 0.94, 0.96] as [number, number, number],
  markerColor: [224 / 255, 78 / 255, 0] as [number, number, number],
  glowColor: [0.98, 0.98, 0.99] as [number, number, number],
  markers: [
    { location: [51.5074, -0.1278] as [number, number], size: 0.08 },
    { location: [53.4808, -2.2426] as [number, number], size: 0.05 },
    { location: [25.2048, 55.2708] as [number, number], size: 0.07 },
    { location: [24.7136, 46.6753] as [number, number], size: 0.06 },
    { location: [28.6139, 77.209] as [number, number], size: 0.06 },
    { location: [40.7128, -74.006] as [number, number], size: 0.05 },
    { location: [1.3521, 103.8198] as [number, number], size: 0.05 },
  ],
} as COBEOptions;

function StatValue({ value }: { value: string }) {
  if (value === '24/7') {
    return (
      <>
        <NumberTicker
          value={24}
          className="text-2xl font-bold tracking-normal text-foreground md:text-3xl"
        />
        <span className="text-2xl font-bold text-foreground md:text-3xl">/7</span>
      </>
    );
  }
  const n = Number(value);
  if (!Number.isNaN(n) && value.trim() !== '') {
    return (
      <NumberTicker
        value={n}
        className="text-2xl font-bold tracking-normal text-foreground md:text-3xl"
      />
    );
  }
  return <p className="text-2xl font-bold text-foreground md:text-3xl">{value}</p>;
}

export function SecurityHero({
  status,
  titleLead,
  titleAccent,
  text,
  stats,
  primaryCta,
  secondaryCta,
}: Props) {
  return (
    <section className="relative flex min-h-[calc(100svh-4rem)] w-full flex-col overflow-hidden border-b border-border/50 bg-background md:min-h-[calc(100svh-4.5rem)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 55% 50% at 85% 45%, rgba(224,78,0,0.08), transparent 55%), radial-gradient(ellipse 40% 35% at 10% 70%, rgba(255,255,255,0.03), transparent 50%)',
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-4 py-10 sm:px-6 md:px-8 lg:px-10 lg:py-0">
        <div className="grid flex-1 items-center gap-10 lg:grid-cols-2 lg:gap-8 xl:gap-12">
          <div className="relative z-10 flex flex-col justify-center py-4 lg:py-16">
            <BlurFade delay={0.05} inView>
              <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur-sm">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                {status}
              </div>
            </BlurFade>

            <BlurFade delay={0.12} inView>
              <h1 className="mb-5 max-w-xl text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                {titleLead}
                <br />
                <AnimatedGradientText
                  speed={1.2}
                  colorFrom="#E04E00"
                  colorTo="#FD8018"
                  className="text-4xl font-bold sm:text-5xl lg:text-6xl"
                >
                  {titleAccent}
                </AnimatedGradientText>
              </h1>
            </BlurFade>

            <BlurFade delay={0.2} inView>
              <p className="mb-8 max-w-lg text-base leading-relaxed text-muted-foreground md:text-lg">
                {text}
              </p>
            </BlurFade>

            <BlurFade delay={0.28} inView>
              <div className="mb-10 flex flex-wrap items-center gap-x-8 gap-y-4">
                {stats.map((s, i) => (
                  <div key={s.label} className="flex items-center gap-8">
                    {i > 0 && <div className="h-10 w-px bg-border" aria-hidden />}
                    <div>
                      <div className="flex items-baseline">
                        <StatValue value={s.value} />
                      </div>
                      <p className="text-xs text-muted-foreground md:text-sm">{s.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </BlurFade>

            <BlurFade delay={0.36} inView>
              <div className="flex flex-wrap gap-3">
                <MarketingCta href="/book-demo">{primaryCta}</MarketingCta>
                <Button asChild variant="outline" size="lg" className="border-border hover:bg-muted">
                  <Link href="/platform">{secondaryCta}</Link>
                </Button>
              </div>
            </BlurFade>
          </div>

          <BlurFade
            delay={0.2}
            inView
            className="relative flex min-h-[320px] items-center justify-center sm:min-h-[420px] lg:min-h-full lg:justify-end"
          >
            <Ripple
              className="opacity-35"
              mainCircleSize={180}
              mainCircleOpacity={0.16}
              numCircles={7}
            />
            <div className="relative aspect-square w-full max-w-[560px] lg:max-w-[640px] xl:max-w-[720px]">
              <Globe className="top-0" config={CONTROL_OPS_GLOBE} />
            </div>
          </BlurFade>
        </div>
      </div>
    </section>
  );
}
