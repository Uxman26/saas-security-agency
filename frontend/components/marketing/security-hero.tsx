'use client';

import Link from 'next/link';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { BlurFade } from '@/components/ui/blur-fade';
import { AnimatedGradientText } from '@/components/ui/animated-gradient-text';
import { NumberTicker } from '@/components/ui/number-ticker';
import { MarketingCta } from '@/components/marketing/marketing-cta';
import { GlobeCdn } from '@/components/ui/cobe-globe-cdn';

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
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <section className="relative flex min-h-[calc(100svh-4.25rem)] w-full flex-col overflow-hidden border-b border-border/50 bg-background md:min-h-[calc(100svh-5rem)]">
      {/* Soft brand wash — not a black card */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: isDark
            ? 'radial-gradient(ellipse 50% 45% at 88% 42%, rgba(224,78,0,0.07), transparent 60%), radial-gradient(ellipse 35% 30% at 10% 70%, rgba(253,128,24,0.04), transparent 50%)'
            : 'radial-gradient(ellipse 50% 45% at 88% 42%, rgba(224,78,0,0.05), transparent 60%), radial-gradient(ellipse 40% 35% at 12% 65%, rgba(253,128,24,0.035), transparent 50%)',
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-4 py-10 sm:px-6 md:px-8 lg:px-10 lg:py-0">
        <div className="grid flex-1 items-center gap-8 lg:grid-cols-2 lg:gap-6 xl:gap-10">
          {/* Left copy */}
          <div className="relative z-10 flex flex-col justify-center py-4 lg:py-16">
            <BlurFade delay={0.05} inView>
              <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1 text-xs text-muted-foreground backdrop-blur-sm">
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
                  colorFrom="#F45100"
                  colorTo="#FF6A1F"
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

          {/* Right — Globe CDN (dotted globe + edge markers + live arcs) */}
          <BlurFade
            delay={0.18}
            inView
            className="relative flex min-h-[340px] items-center justify-center sm:min-h-[420px] lg:min-h-full lg:justify-end"
          >
            <GlobeCdn dark={isDark} className="w-full" />
          </BlurFade>
        </div>
      </div>
    </section>
  );
}
