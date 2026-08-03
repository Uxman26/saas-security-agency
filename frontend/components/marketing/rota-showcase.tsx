'use client';

import Link from 'next/link';
import { Check, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { BorderBeam } from '@/components/ui/border-beam';
import { BlurFade } from '@/components/ui/blur-fade';
import { AnimatedGradientText } from '@/components/ui/animated-gradient-text';
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
    <section className="relative overflow-hidden border-b border-border/50 bg-background py-16 md:py-24 dark:bg-[#0B0F14]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 55% 45% at 75% 40%, rgba(224,78,0,0.07), transparent 60%), radial-gradient(ellipse 40% 35% at 15% 60%, rgba(148,163,184,0.06), transparent 55%)',
        }}
      />

      <div className="container relative mx-auto px-4">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-5">
            <BlurFade delay={0.05} inView>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <AnimatedGradientText
                  colorFrom="#E04E00"
                  colorTo="#F97316"
                  speed={1.2}
                  className="font-semibold uppercase tracking-[0.18em]"
                >
                  {eyebrow}
                </AnimatedGradientText>
              </p>
            </BlurFade>

            <BlurFade delay={0.12} inView>
              <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                {title}
              </h2>
            </BlurFade>

            <BlurFade delay={0.2} inView>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">
                {text}
              </p>
            </BlurFade>

            <ul className="mt-8 space-y-3">
              {points.map((p, i) => (
                <BlurFade key={p} delay={0.28 + i * 0.08} inView>
                  <li className="flex items-start gap-3 text-sm text-foreground md:text-[0.95rem]">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                    {p}
                  </li>
                </BlurFade>
              ))}
            </ul>

            <BlurFade delay={0.62} inView>
              <div className="mt-8 flex flex-wrap gap-3">
                <MarketingCta href="/book-demo">{cta}</MarketingCta>
                <Button asChild variant="outline" size="lg" className="border-border hover:bg-muted">
                  <Link href="/platform#rota">
                    {secondaryCta}
                    <ArrowRight className="ms-1.5 size-4 rtl:rotate-180" />
                  </Link>
                </Button>
              </div>
            </BlurFade>
          </div>

          <div className="lg:col-span-7">
            <BlurFade delay={0.18} direction="right" offset={24} inView className="w-full">
              <div className="[perspective:1200px]">
              <motion.figure
                className="relative"
                initial={{ rotateX: 8, y: 28, opacity: 0.85 }}
                whileInView={{ rotateX: 0, y: 0, opacity: 1 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ type: 'spring', stiffness: 70, damping: 18, mass: 0.9 }}
                style={{ transformStyle: 'preserve-3d' }}
              >
                <div
                  aria-hidden
                  className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-foreground/10 via-transparent to-[#E04E00]/15 blur-2xl"
                />

                <div className="relative overflow-hidden rounded-2xl border border-border bg-[#0B0F14] shadow-2xl shadow-foreground/10 ring-1 ring-foreground/5 dark:border-white/10">
                  <div className="flex items-center gap-2 border-b border-white/10 bg-[#11161D] px-4 py-2.5">
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

                  <BorderBeam
                    size={120}
                    duration={8}
                    borderWidth={1.5}
                    colorFrom="#E04E00"
                    colorTo="#FDBA74"
                  />
                  <BorderBeam
                    size={120}
                    duration={8}
                    delay={4}
                    borderWidth={1.5}
                    reverse
                    colorFrom="#FB923C"
                    colorTo="#E04E00"
                  />
                </div>
              </motion.figure>
              </div>
            </BlurFade>
          </div>
        </div>
      </div>
    </section>
  );
}
