'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { Eyebrow, MarketingCta } from '@/components/marketing/marketing-cta';
import { MarketingSection } from '@/components/marketing/marketing-section';
import { RichInline } from '@/components/marketing/marketing-rich-text';
import { Mail } from 'lucide-react';

export function ContactContent() {
  const t = useTranslations('marketing.contact');
  const tc = useTranslations('marketing.cta');

  return (
    <div className="min-h-screen bg-background">
      <MarketingNav />
      <MarketingSection variant="hero" border={false} className="py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-2xl text-center">
          <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Mail className="size-8" />
          </div>
          <Eyebrow>{t('badge')}</Eyebrow>
          <h1 className="text-3xl md:text-4xl font-bold">{t('title')}</h1>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
            <RichInline text={t('intro')} />
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <MarketingCta href="/book-demo">{tc('bookDemo')}</MarketingCta>
            <MarketingCta href="/login" variant="outline">{t('signIn')}</MarketingCta>
          </div>
          <p className="mt-8 text-sm text-muted-foreground">
            {t('newPrefix')}{' '}
            <Link href="/pricing" className="text-primary font-medium hover:underline">{tc('viewPricing')}</Link>
          </p>
        </div>
      </MarketingSection>
      <MarketingFooter />
    </div>
  );
}
