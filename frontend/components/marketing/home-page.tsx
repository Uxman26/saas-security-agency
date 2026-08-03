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
import { ModulesTimelineSection } from '@/components/marketing/modules-timeline-section';
import { GsapReveal } from '@/components/marketing/gsap-reveal';
import { ArrowRight } from 'lucide-react';
import type { TimelineModule } from '@/components/ui/modules-timeline';

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
  const timelineModules = t.raw('timelineModules') as TimelineModule[];

  return (
    <div className="min-h-screen bg-background">
      <MarketingNav active="home" />

      <SecurityHero
        status={t('globeStatus')}
        titleLead={t('globeTitleLead')}
        titleAccent={t('globeTitleAccent')}
        text={t('globeText')}
        stats={t.raw('globeStats') as { value: string; label: string }[]}
        primaryCta={tc('bookDemo')}
        secondaryCta={tc('explorePlatform')}
      />

      <ModulesTimelineSection
        eyebrow={t('timelineEyebrow')}
        title={t('timelineTitle')}
        intro={t('timelineIntro')}
        learnMore={t('learnMore')}
        modules={timelineModules}
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

      <MarketingSection border={false} className="py-20 marketing-cta-bg">
        <GsapReveal className="container relative mx-auto max-w-2xl px-4 text-center">
          <h2 data-reveal className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            {t('finalSecurityTitle')}
          </h2>
          <p data-reveal className="mt-4 text-lg leading-relaxed text-muted-foreground">
            {t('finalSecurityText')}
          </p>
          <div data-reveal className="mt-10 flex flex-wrap justify-center gap-4">
            <MarketingCta href="/book-demo">{tc('bookDemo')}</MarketingCta>
            <Button asChild variant="outline" size="lg" className="border-border hover:bg-muted">
              <Link href="/pricing">{tc('viewPricing')}</Link>
            </Button>
          </div>
        </GsapReveal>
      </MarketingSection>

      <MarketingFooter />
    </div>
  );
}
