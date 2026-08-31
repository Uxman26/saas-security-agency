'use client';

import { useTranslations } from 'next-intl';
import { Marketing3DHero, Marketing3DShell } from '@/components/marketing/marketing-3d-shell';
import { Eyebrow, MarketingCta } from '@/components/marketing/marketing-cta';
import { SectionHeading } from '@/components/marketing/marketing-section';
import { MarketingFaqAccordion } from '@/components/marketing/marketing-faq-accordion';
import { RichInline } from '@/components/marketing/marketing-rich-text';
import { MagicCard } from '@/components/ui/magic-card';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { BorderBeam } from '@/components/ui/border-beam';
import { BlurFade } from '@/components/ui/blur-fade';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

type Props = {
  activeNav?: 'industries';
  eyebrow: string;
  title: string;
  paragraph: string;
  cta: string;
  disclaimer?: string;
  problems: { title: string; text: string }[];
  capabilities: { title: string; text: string }[];
  workflow: string[];
  faqs: { q: string; a: string }[];
};

export function IndustryPageTemplate({
  activeNav = 'industries',
  eyebrow,
  title,
  paragraph,
  cta,
  disclaimer,
  problems,
  capabilities,
  workflow,
  faqs,
}: Props) {
  const ts = useTranslations('marketing.industrySections');
  const tc = useTranslations('marketing.cta');

  return (
    <Marketing3DShell active={activeNav}>
      <div className="mx-auto w-full max-w-6xl space-y-14 px-4 py-12 md:py-16">
        <Marketing3DHero
          eyebrow={<Eyebrow>{eyebrow}</Eyebrow>}
          title={<RichInline text={title} />}
        >
          <p className="text-base leading-relaxed text-muted-foreground md:text-lg">
            <RichInline text={paragraph} />
          </p>
          <div className="pt-2">
            <MarketingCta href="/book-demo">{cta}</MarketingCta>
          </div>
          {disclaimer ? (
            <p className="rounded-2xl border border-border/70 bg-muted/40 p-4 text-sm text-muted-foreground border-s-4 border-s-primary dark:bg-white/5">
              <RichInline text={disclaimer} />
            </p>
          ) : null}
        </Marketing3DHero>

        <section className="space-y-6">
          <BlurFade delay={0.06} inView>
            <SectionHeading title={ts('problems')} />
          </BlurFade>
          <div className="grid gap-4 md:grid-cols-3">
            {problems.map((p, i) => (
              <BlurFade key={p.title} delay={0.08 + i * 0.04} inView>
                <MagicCard
                  className="h-full rounded-2xl"
                  gradientFrom="#F59E0B"
                  gradientTo="#FBBF24"
                  gradientColor="rgba(245,158,11,0.1)"
                  gradientOpacity={0.5}
                >
                  <div className="p-5">
                    <span className="mb-3 inline-flex size-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 ring-1 ring-amber-500/25 dark:text-amber-400">
                      <AlertTriangle className="size-4" />
                    </span>
                    <h3 className="font-semibold leading-snug">{p.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      <RichInline text={p.text} />
                    </p>
                  </div>
                </MagicCard>
              </BlurFade>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <BlurFade delay={0.06} inView>
            <SectionHeading title={ts('capabilities')} />
          </BlurFade>
          <div className="grid gap-4 sm:grid-cols-2">
            {capabilities.map((c, i) => (
              <BlurFade key={c.title} delay={0.08 + i * 0.03} inView>
                <SpotlightCard
                  className="h-full rounded-2xl border-border/70 bg-card/80 p-5 backdrop-blur-md dark:border-white/10 dark:bg-[#11161D]/80"
                  spotlightColor="rgba(224, 78, 0, 0.14)"
                >
                  <div className="flex items-start gap-3">
                    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/20">
                      <CheckCircle2 className="size-4" />
                    </span>
                    <div>
                      <h3 className="font-semibold">{c.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        <RichInline text={c.text} />
                      </p>
                    </div>
                  </div>
                </SpotlightCard>
              </BlurFade>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <BlurFade delay={0.06} inView>
            <SectionHeading title={ts('workflow')} />
          </BlurFade>
          <ol className="mx-auto max-w-3xl space-y-3">
            {workflow.map((step, i) => (
              <BlurFade key={i} delay={0.08 + i * 0.04} inView>
                <MagicCard
                  className="rounded-2xl"
                  gradientFrom="#F45100"
                  gradientTo="#FF6A1F"
                  gradientColor="rgba(224,78,0,0.08)"
                  gradientOpacity={0.45}
                >
                  <li className="flex gap-4 p-4">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
                      {i + 1}
                    </span>
                    <span className="pt-1 text-sm leading-relaxed text-muted-foreground md:text-[15px]">
                      <RichInline text={step} />
                    </span>
                  </li>
                </MagicCard>
              </BlurFade>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-3xl space-y-6">
          <BlurFade delay={0.06} inView>
            <SectionHeading title={ts('faqs')} />
          </BlurFade>
          <BlurFade delay={0.1} inView>
            <div className="rounded-2xl border border-border/70 bg-card/70 p-2 backdrop-blur-md dark:border-white/10 dark:bg-[#11161D]/70">
              <MarketingFaqAccordion items={faqs} />
            </div>
          </BlurFade>
        </section>

        <BlurFade delay={0.1} inView>
          <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-card/60 px-6 py-12 text-center backdrop-blur-md dark:border-white/10 dark:bg-[#11161D]/60">
            <BorderBeam size={120} duration={11} colorFrom="#F45100" colorTo="#FF6A1F" borderWidth={1.5} />
            <div className="relative mx-auto max-w-2xl space-y-6">
              <SectionHeading
                title={ts('finalTitle')}
                subtitle={<RichInline text={ts('finalText')} />}
                align="center"
              />
              <div className="flex flex-wrap justify-center gap-4">
                <MarketingCta href="/book-demo">{cta}</MarketingCta>
                <MarketingCta href="/pricing" variant="outline">
                  {tc('viewPricing')}
                </MarketingCta>
              </div>
            </div>
          </div>
        </BlurFade>
      </div>
    </Marketing3DShell>
  );
}
