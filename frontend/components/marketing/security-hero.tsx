'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { MarketingCta } from '@/components/marketing/marketing-cta';
import { InteractiveGlobe } from '@/components/ui/interactive-globe';

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

export function SecurityHero({
  status,
  titleLead,
  titleAccent,
  text,
  stats,
  primaryCta,
  secondaryCta,
}: Props) {
  const root = useRef<HTMLElement>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.from('[data-hero="badge"]', { opacity: 0, y: 14, duration: 0.5 })
        .from('[data-hero="title"]', { opacity: 0, y: 24, duration: 0.7 }, '-=0.25')
        .from('[data-hero="text"]', { opacity: 0, y: 16, duration: 0.55 }, '-=0.35')
        .from('[data-hero="stats"]', { opacity: 0, y: 14, duration: 0.5 }, '-=0.3')
        .from('[data-hero="cta"]', { opacity: 0, y: 12, duration: 0.45 }, '-=0.25')
        .from('[data-hero="globe"]', { opacity: 0, scale: 0.94, duration: 0.9 }, '-=0.55');
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={root} className="relative overflow-hidden border-b border-border/50 bg-background py-10 md:py-16">
      <div className="container mx-auto px-4">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div
            aria-hidden
            className="pointer-events-none absolute -end-10 top-0 size-96 rounded-full blur-3xl"
            style={{ background: 'rgba(224, 78, 0, 0.06)' }}
          />

          <div className="relative flex min-h-[500px] flex-col md:flex-row">
            <div className="relative z-10 flex flex-1 flex-col justify-center p-8 md:p-12 lg:p-14">
              <div
                data-hero="badge"
                className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground"
              >
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                {status}
              </div>

              <h1
                data-hero="title"
                className="mb-4 text-3xl font-bold leading-[1.1] tracking-tight text-foreground md:text-4xl lg:text-5xl"
              >
                {titleLead}
                <br />
                <span
                  className="bg-clip-text text-transparent"
                  style={{
                    backgroundImage: 'linear-gradient(90deg, #E04E00, #FD8018)',
                  }}
                >
                  {titleAccent}
                </span>
              </h1>

              <p
                data-hero="text"
                className="mb-8 max-w-md text-sm leading-relaxed text-muted-foreground md:text-base"
              >
                {text}
              </p>

              <div data-hero="stats" className="mb-8 flex flex-wrap items-center gap-x-6 gap-y-4">
                {stats.map((s, i) => (
                  <div key={s.label} className="flex items-center gap-6">
                    {i > 0 && <div className="h-8 w-px bg-border" aria-hidden />}
                    <div>
                      <p className="text-2xl font-bold text-foreground">{s.value}</p>
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div data-hero="cta" className="flex flex-wrap gap-3">
                <MarketingCta href="/book-demo">{primaryCta}</MarketingCta>
                <Button asChild variant="outline" size="lg" className="border-border hover:bg-muted">
                  <Link href="/platform">{secondaryCta}</Link>
                </Button>
              </div>
            </div>

            <div
              data-hero="globe"
              className="flex min-h-[360px] flex-1 items-center justify-center p-4 md:min-h-[480px] md:p-6"
            >
              <InteractiveGlobe size={440} dark={isDark} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
