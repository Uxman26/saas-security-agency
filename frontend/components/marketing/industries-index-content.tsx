'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { Eyebrow } from '@/components/marketing/marketing-cta';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

const HREFS = [
  '/industries/security',
  '/industries/cleaning-facilities',
  '/industries/event-staffing',
  '/industries/temporary-staffing',
] as const;

export function IndustriesIndexContent() {
  const t = useTranslations('marketing.industriesIndex');
  const tc = useTranslations('marketing.cta');
  const items = t.raw('items') as { title: string; desc: string }[];

  return (
    <div className="min-h-screen bg-background">
      <MarketingNav active="industries" />
      <section className="border-b border-border/50 py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <Eyebrow>{t('badge')}</Eyebrow>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-6 text-lg text-muted-foreground leading-relaxed">{t('intro')}</p>
        </div>
      </section>
      <section className="py-16">
        <div className="container mx-auto px-4 grid md:grid-cols-2 gap-6 max-w-5xl">
          {items.map((item, i) => (
            <Card key={HREFS[i]}>
              <CardHeader>
                <CardTitle>{item.title}</CardTitle>
                <CardDescription className="text-sm leading-relaxed">{item.desc}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" size="sm">
                  <Link href={HREFS[i]}>{t('learnMore')} <ArrowRight className="size-3.5 ms-1 rtl:rotate-180" /></Link>
                </Button>
              </CardContent>
            </Card>
          ))}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>{t('otherTitle')}</CardTitle>
              <CardDescription className="text-sm leading-relaxed">{t('otherDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/book-demo">{tc('bookDemo')}</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
      <MarketingFooter />
    </div>
  );
}
