'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
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
import { IndustriesBentoSection } from '@/components/marketing/industries-bento-section';
import { BlurFade } from '@/components/ui/blur-fade';
import { TextAnimate } from '@/components/ui/text-animate';
import { BorderBeam } from '@/components/ui/border-beam';
import { Ripple } from '@/components/ui/ripple';
import { FlickeringGrid } from '@/components/ui/flickering-grid';
import type { TimelineModule } from '@/components/ui/modules-timeline';

type Industry = { title: string; text: string; href: string; cta: string };
type Faq = { q: string; a: string };
type Step = { title: string; text: string };

const FEATURE_TONES: FeatureItem['tone'][] = ['ember', 'slate', 'teal', 'forest', 'amber', 'steel'];

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

      <MarketingSection className="relative overflow-hidden bg-background">
        <FlickeringGrid
          className="pointer-events-none absolute inset-0 z-0 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_40%,black,transparent)]"
          squareSize={3}
          gridGap={5}
          flickerChance={0.28}
          color="#E04E00"
          maxOpacity={0.35}
        />
        <div className="container relative z-10 mx-auto px-4">
          <BlurFade delay={0.05} inView className="text-center">
            <TextAnimate
              as="h2"
              by="word"
              animation="blurInUp"
              startOnView
              once
              className="text-3xl font-bold tracking-tight text-foreground md:text-4xl"
            >
              {t('howTitle')}
            </TextAnimate>
          </BlurFade>

          <div className="mx-auto mt-12 grid max-w-4xl gap-8 md:grid-cols-3">
            {steps.map((step, i) => (
              <BlurFade key={step.title} delay={0.12 + i * 0.1} inView>
                <div className="relative text-center">
                  {i < steps.length - 1 && (
                    <div className="absolute start-[calc(50%+2.5rem)] top-8 hidden h-0.5 w-[calc(100%-5rem)] bg-gradient-to-r from-foreground/20 to-transparent md:block" />
                  )}
                  <div className="relative mx-auto mb-5 flex size-14 items-center justify-center overflow-hidden rounded-2xl bg-foreground text-xl font-bold text-background">
                    {i + 1}
                    <BorderBeam
                      size={40}
                      duration={6}
                      delay={i * 1.5}
                      colorFrom="#E04E00"
                      colorTo="#FDBA74"
                      borderWidth={1.5}
                    />
                  </div>
                  <h3 className="text-lg font-bold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    <RichInline text={step.text} />
                  </p>
                </div>
              </BlurFade>
            ))}
          </div>

          <BlurFade delay={0.45} inView className="mt-12 text-center">
            <MarketingCta href="/book-demo">{t('howCta')}</MarketingCta>
          </BlurFade>
        </div>
      </MarketingSection>

      <IndustriesBentoSection
        title={t('industriesTitle')}
        intro={t('industriesIntro')}
        industries={industries}
      />

      <MarketingSection>
        <div className="container mx-auto max-w-2xl px-4 text-center">
          <BlurFade delay={0.05} inView>
            <SectionHeading
              title={t('pricingTitle')}
              subtitle={<RichInline text={t('pricingText')} />}
              align="center"
            />
          </BlurFade>
          <BlurFade delay={0.2} inView>
            <div className="flex flex-wrap justify-center gap-4">
              <MarketingCta href="/pricing">{t('comparePlans')}</MarketingCta>
              <Button asChild variant="outline" size="lg" className="border-border hover:bg-muted">
                <Link href="/book-demo">{tc('discussRequirements')}</Link>
              </Button>
            </div>
          </BlurFade>
        </div>
      </MarketingSection>

      <MarketingSection variant="muted">
        <div className="container mx-auto max-w-2xl px-4">
          <BlurFade delay={0.05} inView>
            <SectionHeading title={t('faqTitle')} align="center" />
          </BlurFade>
          <BlurFade delay={0.15} inView>
            <MarketingFaqAccordion items={faqs} />
          </BlurFade>
        </div>
      </MarketingSection>

      <MarketingSection border={false} className="relative overflow-hidden py-20 marketing-cta-bg">
        <Ripple
          className="opacity-25"
          mainCircleSize={180}
          mainCircleOpacity={0.16}
          numCircles={6}
        />
        <div className="container relative mx-auto max-w-2xl px-4 text-center">
          <BlurFade delay={0.05} inView>
            <TextAnimate
              as="h2"
              by="word"
              animation="blurInUp"
              startOnView
              once
              className="text-3xl font-bold tracking-tight text-foreground md:text-4xl"
            >
              {t('finalSecurityTitle')}
            </TextAnimate>
          </BlurFade>
          <BlurFade delay={0.18} inView>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              {t('finalSecurityText')}
            </p>
          </BlurFade>
          <BlurFade delay={0.3} inView>
            <div className="relative mx-auto mt-10 inline-flex flex-wrap justify-center gap-4 overflow-hidden rounded-2xl p-1">
              <MarketingCta href="/book-demo">{tc('bookDemo')}</MarketingCta>
              <Button asChild variant="outline" size="lg" className="border-border hover:bg-muted">
                <Link href="/pricing">{tc('viewPricing')}</Link>
              </Button>
              <BorderBeam size={80} duration={7} colorFrom="#E04E00" colorTo="#FDBA74" />
            </div>
          </BlurFade>
        </div>
      </MarketingSection>

      <MarketingFooter />
    </div>
  );
}
