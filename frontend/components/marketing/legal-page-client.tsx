'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';

type LegalKey = 'privacy' | 'terms' | 'cookies' | 'dpa' | 'accessibility' | 'security';

export function LegalPageClient({ page }: { page: LegalKey }) {
  const t = useTranslations(`marketing.legal.${page}`);
  const tf = useTranslations('marketing.legal');

  return (
    <div className="min-h-screen bg-background">
      <MarketingNav />
      <article className="legal-prose container mx-auto px-4 py-12 md:py-16 max-w-3xl">
        <header className="not-prose mb-10 border-b border-border pb-6">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">{t('title')}</h1>
        </header>
        <p>{t('body')}</p>
        <p className="not-prose mt-12 border-t border-border pt-6 text-sm text-muted-foreground">
          {tf('footerPrefix')}{' '}
          <Link href="/book-demo" className="text-primary hover:underline">{tf('footerLink')}</Link>{' '}
          {tf('footerSuffix')}
        </p>
      </article>
      <MarketingFooter />
    </div>
  );
}
