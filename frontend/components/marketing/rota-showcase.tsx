'use client';

import Link from 'next/link';
import { Check, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GsapMediaReveal, GsapReveal } from '@/components/marketing/gsap-reveal';
import { MarketingCta } from '@/components/marketing/marketing-cta';
import { ProductScreenshot } from '@/components/marketing/product-screenshot';

type Props = {
  eyebrow: string;
  title: string;
  text: string;
  points: string[];
  cta: string;
  secondaryCta: string;
  caption: string;
};

export function RotaShowcase({
  eyebrow,
  title,
  text,
  points,
  cta,
  secondaryCta,
  caption,
}: Props) {
  return (
    <section className="relative overflow-hidden border-b border-border/50 bg-background py-16 md:py-24">
      <div className="container mx-auto px-4">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-14">
          <GsapReveal className="lg:col-span-5">
            <p data-reveal className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {eyebrow}
            </p>
            <h2 data-reveal className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              {title}
            </h2>
            <p data-reveal className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">
              {text}
            </p>
            <ul data-reveal className="mt-8 space-y-3">
              {points.map((p) => (
                <li key={p} className="flex items-start gap-3 text-sm text-foreground md:text-[0.95rem]">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
            <div data-reveal className="mt-8 flex flex-wrap gap-3">
              <MarketingCta href="/book-demo">{cta}</MarketingCta>
              <Button asChild variant="outline" size="lg" className="border-border hover:bg-muted">
                <Link href="/platform#rota">
                  {secondaryCta}
                  <ArrowRight className="ms-1.5 size-4 rtl:rotate-180" />
                </Link>
              </Button>
            </div>
          </GsapReveal>

          <div className="lg:col-span-7">
            <GsapMediaReveal>
              <figure className="relative">
                <div
                  aria-hidden
                  className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-foreground/10 via-transparent to-[#E04E00]/10 blur-2xl"
                />
                <div className="relative overflow-hidden rounded-2xl border border-border bg-[#0B0F14] shadow-2xl shadow-foreground/10 ring-1 ring-foreground/5">
                  <div className="flex items-center gap-2 border-b border-white/10 bg-[#161E2C] px-4 py-2.5">
                    <span className="size-2.5 rounded-full bg-red-400/80" />
                    <span className="size-2.5 rounded-full bg-amber-400/80" />
                    <span className="size-2.5 rounded-full bg-emerald-400/80" />
                    <span className="ms-2 text-[11px] font-medium text-white/60">{caption}</span>
                  </div>
                  <ProductScreenshot
                    alt={title}
                    width={1600}
                    height={1000}
                    className="h-auto w-full object-cover object-top"
                    sizes="(max-width: 1024px) 100vw, 58vw"
                  />
                </div>
              </figure>
            </GsapMediaReveal>
          </div>
        </div>
      </div>
    </section>
  );
}
