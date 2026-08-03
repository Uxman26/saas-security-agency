'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { MarketingCta } from '@/components/marketing/marketing-cta';
import { MarketingFaqAccordion } from '@/components/marketing/marketing-faq-accordion';
import { MarketingSection, SectionHeading } from '@/components/marketing/marketing-section';
import { RichInline } from '@/components/marketing/marketing-rich-text';
import { SecurityHero } from '@/components/marketing/security-hero';
import { SecurityFeatureGrid, type FeatureItem } from '@/components/marketing/security-feature-grid';
import { RotaShowcase } from '@/components/marketing/rota-showcase';
import { PatrolShowcase } from '@/components/marketing/patrol-showcase';
import { VisionRobotSection } from '@/components/marketing/vision-robot-section';
import { GsapReveal } from '@/components/marketing/gsap-reveal';
import { ArrowRight } from 'lucide-react';

type Industry = { title: string; text: string; href: string; cta: string };
type Faq = { q: string; a: string };
type Step = { title: string; text: string };

const FEATURE_TONES: FeatureItem['tone'][] = ['ember', 'slate', 'teal', 'forest', 'indigo', 'steel'];

export function HomePage() {
  const t = useTranslations('marketing.home');
  const tc = useTranslations('marketing.cta');

  const spotlight = t.raw('spotlightFeatures') as { title: string; text: string; href: string }[];
  const features: FeatureItem[] = spotlight.map((f, i) => ({
    ...f,
    tone: FEATURE_TONES[i % FEATURE_TONES.length],
  }));
  const rotaPoints = t.raw('rotaPoints') as string[];
  const patrolItems = t.raw('patrolItems') as { title: string; text: string }[];
  const industries = t.raw('industries') as Industry[];
  const steps = t.raw('steps') as Step[];
  const faqs = t.raw('faqs') as Faq[];

  return (
    <div className="min-h-screen bg-background">
      <MarketingNav active="home" />

      <SecurityHero
        badge={t('securityBadge')}
        title={t('securityHeroTitle')}
        text={t('securityHeroText')}
        primaryCta={tc('bookDemo')}
        secondaryCta={tc('explorePlatform')}
        imageCaption={t('rotaCaption')}
      />

      <SecurityFeatureGrid
        eyebrow={t('spotlightEyebrow')}
        title={t('spotlightTitle')}
        intro={t('spotlightIntro')}
        features={features}
        learnMore={t('learnMore')}
      />

      <VisionRobotSection
        eyebrow={t('visionEyebrow')}
        quote={t('visionQuote')}
        attribution={t('visionAttribution')}
      />

      <RotaShowcase
        eyebrow={t('rotaEyebrow')}
        title={t('rotaTitle')}
        text={t('rotaText')}
        points={rotaPoints}
        cta={tc('bookDemo')}
        secondaryCta={t('rotaSecondaryCta')}
        caption={t('rotaCaption')}
      />

      <PatrolShowcase
        eyebrow={t('patrolEyebrow')}
        title={t('patrolTitle')}
        text={t('patrolText')}
        items={patrolItems}
        cta={t('patrolCta')}
      />

      <MarketingSection>
        <div className="container mx-auto px-4">
          <GsapReveal>
            <div data-reveal>
              <SectionHeading title={t('howTitle')} align="center" />
            </div>
          </GsapReveal>
          <GsapReveal className="mx-auto grid max-w-4xl gap-8 md:grid-cols-3" stagger={0.12}>
            {steps.map((step, i) => (
              <div key={step.title} data-reveal className="relative text-center">
                {i < steps.length - 1 && (
                  <div className="absolute start-[calc(50%+2.5rem)] top-8 hidden h-0.5 w-[calc(100%-5rem)] bg-gradient-to-r from-foreground/20 to-transparent md:block" />
                )}
                <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-foreground text-xl font-bold text-background">
                  {i + 1}
                </div>
                <h3 className="text-lg font-bold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  <RichInline text={step.text} />
                </p>
              </div>
            ))}
          </GsapReveal>
          <GsapReveal className="mt-12 text-center">
            <div data-reveal>
              <MarketingCta href="/book-demo">{t('howCta')}</MarketingCta>
            </div>
          </GsapReveal>
        </div>
      </MarketingSection>

      <MarketingSection variant="muted">
        <div className="container mx-auto px-4">
          <GsapReveal>
            <div data-reveal>
              <SectionHeading
                title={<RichInline text={t('industriesTitle')} variant="hero" />}
                subtitle={<RichInline text={t('industriesIntro')} />}
              />
            </div>
          </GsapReveal>
          <GsapReveal className="grid gap-5 md:grid-cols-2 lg:grid-cols-3" stagger={0.08}>
            {industries.slice(0, 3).map((ind) => (
              <div key={ind.title} data-reveal>
                <Card className="flex h-full flex-col overflow-hidden shadow-sm marketing-card-hover">
                  <div className="h-1 bg-foreground" />
                  <CardHeader>
                    <CardTitle className="text-lg font-bold">{ind.title}</CardTitle>
                    <CardDescription className="mt-2 text-sm leading-relaxed">
                      <RichInline text={ind.text} />
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto pt-0">
                    <Button asChild variant="outline" size="sm" className="border-border hover:bg-muted">
                      <Link href={ind.href}>
                        {ind.cta}
                        <ArrowRight className="ms-1 size-3.5 rtl:rotate-180" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </div>
            ))}
          </GsapReveal>
        </div>
      </MarketingSection>

      <MarketingSection>
        <div className="container mx-auto max-w-2xl px-4 text-center">
          <SectionHeading
            title={t('pricingTitle')}
            subtitle={<RichInline text={t('pricingText')} />}
            align="center"
          />
          <div className="flex flex-wrap justify-center gap-4">
            <MarketingCta href="/pricing">{t('comparePlans')}</MarketingCta>
            <Button asChild variant="outline" size="lg" className="border-border hover:bg-muted">
              <Link href="/book-demo">{tc('discussRequirements')}</Link>
            </Button>
          </div>
        </div>
      </MarketingSection>

      <MarketingSection variant="muted">
        <div className="container mx-auto max-w-2xl px-4">
          <SectionHeading title={t('faqTitle')} align="center" />
          <MarketingFaqAccordion items={faqs} />
        </div>
      </MarketingSection>

      <section className="relative overflow-hidden border-b border-white/5 bg-[#0B0F14] py-20 md:py-24">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 50% 100%, rgba(224,78,0,0.12), transparent 60%)',
          }}
        />
        <GsapReveal className="container relative mx-auto max-w-2xl px-4 text-center">
          <h2 data-reveal className="text-3xl font-bold tracking-tight text-white md:text-4xl">
            {t('finalSecurityTitle')}
          </h2>
          <p data-reveal className="mt-4 text-lg leading-relaxed text-slate-400">
            {t('finalSecurityText')}
          </p>
          <div data-reveal className="mt-10 flex flex-wrap justify-center gap-4">
            <MarketingCta href="/book-demo">{tc('bookDemo')}</MarketingCta>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/pricing">{tc('viewPricing')}</Link>
            </Button>
          </div>
        </GsapReveal>
      </section>

      <MarketingFooter />
    </div>
  );
}
