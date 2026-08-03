'use client';

import { useTranslations } from 'next-intl';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { Eyebrow, MarketingCta } from '@/components/marketing/marketing-cta';
import { MarketingSection, SectionHeading } from '@/components/marketing/marketing-section';
import { RichInline } from '@/components/marketing/marketing-rich-text';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Target, Users, Shield } from 'lucide-react';

export function AboutContent() {
  const t = useTranslations('marketing.about');

  return (
    <div className="min-h-screen bg-background">
      <MarketingNav active="about" />
      <MarketingSection variant="hero" className="py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <Eyebrow>{t('badge')}</Eyebrow>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
            <RichInline text={t('hero')} />
          </p>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            <RichInline text={t('hero2')} />
          </p>
        </div>
      </MarketingSection>
      <MarketingSection variant="muted">
        <div className="container mx-auto px-4 max-w-4xl grid md:grid-cols-2 gap-6">
          <Card className="marketing-card-hover border-t-2 border-t-foreground/40">
            <CardHeader>
              <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-muted text-foreground">
                <Users className="size-5" />
              </div>
              <CardTitle>{t('whoTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground leading-relaxed">
              <RichInline text={t('whoText')} />
            </CardContent>
          </Card>
          <Card className="marketing-card-hover border-t-2 border-t-foreground/40">
            <CardHeader>
              <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-muted text-foreground">
                <Target className="size-5" />
              </div>
              <CardTitle>{t('missionTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground leading-relaxed">
              <RichInline text={t('missionText')} />
            </CardContent>
          </Card>
        </div>
      </MarketingSection>
      <MarketingSection>
        <div className="container mx-auto px-4 max-w-4xl grid md:grid-cols-2 gap-10">
          <div className="rounded-2xl border bg-card p-6 marketing-card-hover">
            <h2 className="text-2xl font-bold">{t('audienceTitle')}</h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              <RichInline text={t('audienceText')} />
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-6 marketing-card-hover border-s-4 border-s-foreground">
            <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-muted text-foreground">
              <Shield className="size-5" />
            </div>
            <h2 className="text-2xl font-bold">{t('securityTitle')}</h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              <RichInline text={t('securityText')} />
            </p>
          </div>
        </div>
      </MarketingSection>
      <MarketingSection border={false} variant="cta" className="py-16">
        <div className="container mx-auto px-4 text-center">
          <MarketingCta href="/book-demo">{t('cta')}</MarketingCta>
        </div>
      </MarketingSection>
      <MarketingFooter />
    </div>
  );
}
