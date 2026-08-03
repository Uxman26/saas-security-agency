'use client';

import Link from 'next/link';
import type { COBEOptions } from 'cobe';
import { Button } from '@/components/ui/button';
import { Globe } from '@/components/ui/globe';
import { BlurFade } from '@/components/ui/blur-fade';
import { AnimatedGradientText } from '@/components/ui/animated-gradient-text';
import { BorderBeam } from '@/components/ui/border-beam';
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
  width: 800,
  height: 800,
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
        <NumberTicker value={24} className="text-2xl font-bold text-foreground tracking-normal" />
        <span className="text-2xl font-bold text-foreground">/7</span>
      </>
    );
  }
  const n = Number(value);
  if (!Number.isNaN(n) && value.trim() !== '') {
    return (
      <NumberTicker value={n} className="text-2xl font-bold text-foreground tracking-normal" />
    );
  }
  return <p className="text-2xl font-bold text-foreground">{value}</p>;
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
    <section className="relative overflow-hidden border-b border-border/50 bg-background py-10 md:py-16">
      <div className="container mx-auto px-4">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div
            aria-hidden
            className="pointer-events-none absolute -end-16 top-0 size-[28rem] rounded-full blur-3xl"
            style={{ background: 'rgba(224, 78, 0, 0.07)' }}
          />

          <div className="relative flex min-h-[520px] flex-col md:flex-row">
            <div className="relative z-10 flex flex-1 flex-col justify-center p-8 md:p-12 lg:p-14">
              <BlurFade delay={0.05} inView>
                <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground">
                  <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                  {status}
                </div>
              </BlurFade>

              <BlurFade delay={0.12} inView>
                <h1 className="mb-4 text-3xl font-bold leading-[1.1] tracking-tight text-foreground md:text-4xl lg:text-5xl">
                  {titleLead}
                  <br />
                  <AnimatedGradientText
                    speed={1.2}
                    colorFrom="#E04E00"
                    colorTo="#FD8018"
                    className="text-3xl font-bold md:text-4xl lg:text-5xl"
                  >
                    {titleAccent}
                  </AnimatedGradientText>
                </h1>
              </BlurFade>

              <BlurFade delay={0.2} inView>
                <p className="mb-8 max-w-md text-sm leading-relaxed text-muted-foreground md:text-base">
                  {text}
                </p>
              </BlurFade>

              <BlurFade delay={0.28} inView>
                <div className="mb-8 flex flex-wrap items-center gap-x-6 gap-y-4">
                  {stats.map((s, i) => (
                    <div key={s.label} className="flex items-center gap-6">
                      {i > 0 && <div className="h-8 w-px bg-border" aria-hidden />}
                      <div>
                        <div className="flex items-baseline">
                          <StatValue value={s.value} />
                        </div>
                        <p className="text-xs text-muted-foreground">{s.label}</p>
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
              delay={0.25}
              inView
              className="relative flex min-h-[380px] flex-1 items-center justify-center overflow-hidden md:min-h-[520px]"
            >
              <Ripple
                className="opacity-40"
                mainCircleSize={160}
                mainCircleOpacity={0.18}
                numCircles={6}
              />
              <div className="relative mx-auto aspect-square w-full max-w-[480px]">
                <Globe className="top-0" config={CONTROL_OPS_GLOBE} />
              </div>
            </BlurFade>
          </div>

          <BorderBeam size={140} duration={10} colorFrom="#E04E00" colorTo="#FDBA74" borderWidth={1.5} />
          <BorderBeam
            size={140}
            duration={10}
            delay={5}
            reverse
            colorFrom="#FB923C"
            colorTo="#E04E00"
            borderWidth={1.5}
          />
        </div>
      </div>
    </section>
  );
}
