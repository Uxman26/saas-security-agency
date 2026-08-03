'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { Button } from '@/components/ui/button';
import { MarketingCta } from '@/components/marketing/marketing-cta';
import { MarketingBrand } from '@/components/marketing/marketing-brand';
import { ProductScreenshot } from '@/components/marketing/product-screenshot';

type Props = {
  badge: string;
  title: string;
  text: string;
  primaryCta: string;
  secondaryCta: string;
  imageCaption: string;
};

export function SecurityHero({
  badge,
  title,
  text,
  primaryCta,
  secondaryCta,
  imageCaption,
}: Props) {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.from('[data-hero="brand"]', { opacity: 0, y: 20, duration: 0.7 })
        .from('[data-hero="badge"]', { opacity: 0, y: 16, duration: 0.55 }, '-=0.35')
        .from('[data-hero="title"]', { opacity: 0, y: 28, duration: 0.75 }, '-=0.3')
        .from('[data-hero="text"]', { opacity: 0, y: 20, duration: 0.6 }, '-=0.4')
        .from('[data-hero="cta"]', { opacity: 0, y: 16, duration: 0.55 }, '-=0.35')
        .from('[data-hero="media"]', { opacity: 0, y: 40, scale: 0.97, duration: 1 }, '-=0.55');
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={root}
      className="relative overflow-hidden border-b border-white/5 bg-[#0B0F14] text-white"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 90% 70% at 15% -20%, rgba(224,78,0,0.16), transparent 50%), radial-gradient(ellipse 60% 50% at 90% 10%, rgba(22,30,44,0.9), transparent 55%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'linear-gradient(to bottom, black 0%, transparent 85%)',
        }}
      />

      <div className="container relative mx-auto px-4 pb-16 pt-14 md:pb-24 md:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-10">
          <div className="max-w-xl">
            <div data-hero="brand" className="mb-8 [&_img]:brightness-0 [&_img]:invert">
              <MarketingBrand size="nav" />
            </div>
            <p
              data-hero="badge"
              className="mb-5 inline-flex rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium tracking-wide text-slate-300"
            >
              {badge}
            </p>
            <h1
              data-hero="title"
              className="text-4xl font-bold leading-[1.1] tracking-tight text-white md:text-5xl lg:text-[3.4rem]"
            >
              {title}
            </h1>
            <p data-hero="text" className="mt-5 text-lg leading-relaxed text-slate-400 md:text-xl">
              {text}
            </p>
            <div data-hero="cta" className="mt-8 flex flex-wrap gap-3">
              <MarketingCta href="/book-demo">{primaryCta}</MarketingCta>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                <Link href="/platform">{secondaryCta}</Link>
              </Button>
            </div>
          </div>

          <div data-hero="media" className="relative lg:-me-4">
            <div
              aria-hidden
              className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-[#E04E00]/25 via-transparent to-teal-500/10 blur-3xl"
            />
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#121820] shadow-2xl shadow-black/50">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
                <div className="flex gap-1.5">
                  <span className="size-2.5 rounded-full bg-red-400/80" />
                  <span className="size-2.5 rounded-full bg-amber-400/80" />
                  <span className="size-2.5 rounded-full bg-emerald-400/80" />
                </div>
                <span className="text-[11px] font-medium text-white/55">{imageCaption}</span>
              </div>
              <ProductScreenshot
                alt={imageCaption}
                width={1400}
                height={900}
                className="h-auto w-full object-cover object-left-top"
                sizes="(max-width: 1024px) 100vw, 50vw"
                priority
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
