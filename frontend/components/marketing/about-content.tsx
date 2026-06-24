'use client';

import { useTranslations } from 'next-intl';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { Eyebrow, MarketingCta } from '@/components/marketing/marketing-cta';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function AboutContent() {
  const t = useTranslations('marketing.about');

  return (
    <div className="min-h-screen bg-background">
      <MarketingNav active="about" />
      <section className="border-b border-border/50 py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <Eyebrow>{t('badge')}</Eyebrow>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-6 text-lg text-muted-foreground leading-relaxed">{t('hero')}</p>
          <p className="mt-4 text-muted-foreground leading-relaxed">{t('hero2')}</p>
        </div>
      </section>
      <section className="py-16 border-b border-border/50 bg-muted/20">
        <div className="container mx-auto px-4 max-w-4xl grid md:grid-cols-2 gap-8">
          <Card>
            <CardHeader>
              <CardTitle>{t('whoTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground leading-relaxed">{t('whoText')}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('missionTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground leading-relaxed">{t('missionText')}</CardContent>
          </Card>
        </div>
      </section>
      <section className="py-16 border-b border-border/50">
        <div className="container mx-auto px-4 max-w-4xl grid md:grid-cols-2 gap-8">
          <div>
            <h2 className="text-2xl font-bold">{t('audienceTitle')}</h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">{t('audienceText')}</p>
          </div>
          <div>
            <h2 className="text-2xl font-bold">{t('securityTitle')}</h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">{t('securityText')}</p>
          </div>
        </div>
      </section>
      <section className="py-16">
        <div className="container mx-auto px-4 text-center">
          <MarketingCta href="/book-demo">{t('cta')}</MarketingCta>
        </div>
      </section>
      <MarketingFooter />
    </div>
  );
}
