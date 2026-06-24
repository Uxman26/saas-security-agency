'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { Eyebrow, MarketingCta } from '@/components/marketing/marketing-cta';

export function ContactContent() {
  const t = useTranslations('marketing.contact');
  const tc = useTranslations('marketing.cta');

  return (
    <div className="min-h-screen bg-background">
      <MarketingNav />
      <section className="container mx-auto px-4 py-16 md:py-24 max-w-2xl text-center">
        <Eyebrow>{t('badge')}</Eyebrow>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="mt-4 text-muted-foreground">{t('intro')}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <MarketingCta href="/book-demo">{tc('bookDemo')}</MarketingCta>
          <MarketingCta href="/login" variant="outline">{t('signIn')}</MarketingCta>
        </div>
        <p className="mt-8 text-sm text-muted-foreground">
          {t('newPrefix')}{' '}
          <Link href="/pricing" className="text-primary hover:underline">{tc('viewPricing')}</Link>
        </p>
      </section>
      <MarketingFooter />
    </div>
  );
}
