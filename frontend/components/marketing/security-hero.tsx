'use client';

import Link from 'next/link';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BlurFade } from '@/components/ui/blur-fade';
import { AnimatedGradientText } from '@/components/ui/animated-gradient-text';
import { NumberTicker } from '@/components/ui/number-ticker';
import { MarketingCta } from '@/components/marketing/marketing-cta';
import { SplineScene } from '@/components/ui/splite';
import { Spotlight } from '@/components/ui/spotlight';
import { cn } from '@/lib/utils';

/** 21st.dev robot scene used by SplineSceneBasic demo. */
const HERO_SPLINE_SCENE = 'https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode';

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

function StatValue({ value }: { value: string }) {
  if (value === '24/7') {
    return (
      <>
        <NumberTicker
          value={24}
          className="text-2xl font-bold tracking-normal text-neutral-900 dark:text-neutral-50 md:text-3xl"
        />
        <span className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 md:text-3xl">/7</span>
      </>
    );
  }
  const n = Number(value);
  if (!Number.isNaN(n) && value.trim() !== '') {
    return (
      <NumberTicker
        value={n}
        className="text-2xl font-bold tracking-normal text-neutral-900 dark:text-neutral-50 md:text-3xl"
      />
    );
  }
  return <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 md:text-3xl">{value}</p>;
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
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';

  return (
    <section className="relative w-full overflow-hidden border-b border-border/50 bg-background">
      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 md:px-8 lg:px-10 lg:py-12">
        <BlurFade delay={0.08} inView>
          <Card
            className={cn(
              'relative h-auto min-h-[520px] gap-0 overflow-hidden border py-0 shadow-2xl md:min-h-[560px] lg:min-h-[600px]',
              'bg-gradient-to-br from-orange-50/90 via-white to-stone-100',
              'dark:bg-black/[0.96] dark:from-transparent dark:via-transparent dark:to-transparent',
              'border-orange-200/60 dark:border-white/10'
            )}
          >
            <Spotlight
              className="-top-40 left-0 md:left-60 md:-top-20"
              fill={isDark ? 'white' : '#FD8018'}
            />

            <div className="relative z-10 flex h-full min-h-[520px] flex-col lg:min-h-[600px] lg:flex-row">
              {/* Left — ControlOps hero copy */}
              <div className="relative z-10 flex flex-1 flex-col justify-center p-6 sm:p-8 md:p-10 lg:max-w-[52%] lg:p-12">
                <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-orange-200/80 bg-white/70 px-3 py-1 text-xs text-neutral-600 backdrop-blur-sm dark:border-white/15 dark:bg-white/5 dark:text-neutral-300">
                  <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                  {status}
                </div>

                <h1 className="mb-4 max-w-xl text-3xl font-bold leading-[1.08] tracking-tight text-neutral-900 sm:text-4xl md:text-5xl lg:text-6xl dark:bg-gradient-to-b dark:from-neutral-50 dark:to-neutral-400 dark:bg-clip-text dark:text-transparent">
                  {titleLead}
                  <br />
                  <AnimatedGradientText
                    speed={1.2}
                    colorFrom="#E04E00"
                    colorTo="#FD8018"
                    className="text-3xl font-bold sm:text-4xl md:text-5xl lg:text-6xl"
                  >
                    {titleAccent}
                  </AnimatedGradientText>
                </h1>

                <p className="mb-7 max-w-lg text-sm leading-relaxed text-neutral-600 sm:text-base md:text-lg dark:text-neutral-300">
                  {text}
                </p>

                <div className="mb-8 flex flex-wrap items-center gap-x-6 gap-y-3">
                  {stats.map((s, i) => (
                    <div key={s.label} className="flex items-center gap-6">
                      {i > 0 && (
                        <div className="h-9 w-px bg-neutral-300 dark:bg-white/15" aria-hidden />
                      )}
                      <div>
                        <div className="flex items-baseline">
                          <StatValue value={s.value} />
                        </div>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">{s.label}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-3">
                  <MarketingCta href="/book-demo">{primaryCta}</MarketingCta>
                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="border-neutral-300 bg-white/60 hover:bg-white dark:border-white/20 dark:bg-transparent dark:hover:bg-white/10"
                  >
                    <Link href="/platform">{secondaryCta}</Link>
                  </Button>
                </div>
              </div>

              {/* Right — interactive 3D Spline robot */}
              <div className="relative h-[320px] w-full flex-1 sm:h-[380px] lg:h-auto lg:min-h-full">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-orange-50/80 via-transparent to-transparent lg:bg-gradient-to-l lg:from-transparent lg:via-transparent dark:from-black/40 dark:lg:from-transparent"
                />
                <SplineScene scene={HERO_SPLINE_SCENE} className="h-full w-full" />
              </div>
            </div>
          </Card>
        </BlurFade>
      </div>
    </section>
  );
}
