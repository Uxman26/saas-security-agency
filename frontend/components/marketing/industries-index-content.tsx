'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { Eyebrow } from '@/components/marketing/marketing-cta';
import { MarketingSection } from '@/components/marketing/marketing-section';
import { RichInline } from '@/components/marketing/marketing-rich-text';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, Building2 } from 'lucide-react';

const HREFS = [
  '/industries/security',
  '/industries/cleaning-facilities',
  '/industries/event-staffing',
  '/industries/temporary-staffing',
] as const;

const INDUSTRY_ICONS = [Building2, Building2, Building2, Building2];

export function IndustriesIndexContent() {
  const t = useTranslations('marketing.industriesIndex');
  const tc = useTranslations('marketing.cta');
  const items = t.raw('items') as { title: string; desc: string }[];

  return (
    <div className="min-h-screen bg-background">
      <MarketingNav active="industries" />
      <MarketingSection variant="hero" className="py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <Eyebrow>{t('badge')}</Eyebrow>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
            <RichInline text={t('intro')} />
          </p>
        </div>
      </MarketingSection>
      <MarketingSection>
        <div className="container mx-auto px-4 grid md:grid-cols-2 gap-5 max-w-5xl">
          {items.map((item, i) => {
            const Icon = INDUSTRY_ICONS[i];
            return (
              <Card key={HREFS[i]} className="marketing-card-hover group">
                <CardHeader>
                  <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <Icon className="size-5" />
                  </div>
                  <CardTitle>{item.title}</CardTitle>
                  <CardDescription className="text-sm leading-relaxed">
                    <RichInline text={item.desc} />
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="outline" size="sm" className="border-primary/30 hover:bg-primary/5">
                    <Link href={HREFS[i]}>{t('learnMore')} <ArrowRight className="size-3.5 ms-1 rtl:rotate-180" /></Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
          <Card className="md:col-span-2 marketing-card-hover border-2 border-dashed border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle>{t('otherTitle')}</CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                <RichInline text={t('otherDesc')} />
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/book-demo">{tc('bookDemo')}</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </MarketingSection>
      <MarketingFooter />
    </div>
  );
}
